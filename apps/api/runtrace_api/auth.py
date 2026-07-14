from __future__ import annotations

import hashlib
import json
import re
import secrets
import time
from base64 import urlsafe_b64decode, urlsafe_b64encode
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .config import settings
from .database import SessionLocal, get_db
from .models import ApiToken, ApiTokenProject, Artifact, AuthSession, Identity, Project, ProjectMembership, Run, now_utc


SESSION_COOKIE = "runtrace_session"
LOGIN_ATTEMPT_LIMIT = 10
LOGIN_ATTEMPT_WINDOW_SECONDS = 300
_login_attempts: dict[str, list[float]] = {}
_login_attempts_lock = Lock()
router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])


@dataclass(frozen=True)
class AuthPrincipal:
    id: str
    username: str
    role: str
    status: str
    dev: bool = False
    token_project_ids: frozenset[str] | None = None


class BootstrapRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
    password: str = Field(min_length=12, max_length=1024)


class SetupRequest(BaseModel):
    token: str = Field(min_length=32, max_length=256)
    password: str = Field(min_length=12, max_length=1024)


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=1, max_length=1024)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    new_password: str = Field(min_length=12, max_length=1024)


class IdentityCreateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
    role: Literal["admin", "member"] = "member"


class IdentityUpdateRequest(BaseModel):
    role: Literal["admin", "member"] | None = None
    status: Literal["active", "suspended"] | None = None


class ApiTokenCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    expires_in_days: int | None = Field(default=None, ge=1, le=365)
    project_ids: list[str] = Field(default_factory=list)


class ProjectMemberRequest(BaseModel):
    identity_id: str | None = None
    username: str | None = Field(default=None, min_length=3, max_length=32)
    role: Literal["owner", "editor", "viewer"] = "viewer"


class ProjectMemberUpdateRequest(BaseModel):
    role: Literal["owner", "editor", "viewer"]


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, dklen=32)
    encode = lambda value: urlsafe_b64encode(value).decode().rstrip("=")
    return f"scrypt$16384$8$1${encode(salt)}${encode(digest)}"


def _password_matches(password: str, encoded: str) -> bool:
    try:
        algorithm, n, r, p, salt_value, digest_value = encoded.split("$")
        if algorithm != "scrypt":
            return False
        decode = lambda value: urlsafe_b64decode(value + "=" * (-len(value) % 4))
        expected = decode(digest_value)
        actual = hashlib.scrypt(
            password.encode(), salt=decode(salt_value), n=int(n), r=int(r), p=int(p), dklen=len(expected)
        )
        return secrets.compare_digest(actual, expected)
    except (TypeError, ValueError):
        return False


_DUMMY_PASSWORD_HASH = _password_hash(secrets.token_urlsafe(24))


def _login_key(request: Request, username: str) -> str:
    host = request.client.host if request.client else "unknown"
    return f"{host}:{username.strip().lower()}"


def _check_login_limit(key: str) -> None:
    cutoff = time.monotonic() - LOGIN_ATTEMPT_WINDOW_SECONDS
    with _login_attempts_lock:
        recent = [attempt for attempt in _login_attempts.get(key, []) if attempt > cutoff]
        _login_attempts[key] = recent
        if len(recent) >= LOGIN_ATTEMPT_LIMIT:
            raise HTTPException(429, "Too many sign-in attempts. Try again in a few minutes.")


def _record_login_failure(key: str) -> None:
    with _login_attempts_lock:
        _login_attempts.setdefault(key, []).append(time.monotonic())


def _clear_login_failures(key: str) -> None:
    with _login_attempts_lock:
        _login_attempts.pop(key, None)


def apply_owner_recovery_password(session: Session) -> None:
    password = settings.owner_recovery_password
    if not password:
        return
    if len(password) < 12:
        raise RuntimeError("RUNTRACE_OWNER_RECOVERY_PASSWORD must contain at least 12 characters")
    owner = session.scalar(select(Identity).where(Identity.role == "owner"))
    if owner and (not owner.password_hash or not _password_matches(password, owner.password_hash)):
        owner.password_hash = _password_hash(password)
        owner.status = "active"
        session.execute(delete(AuthSession).where(AuthSession.identity_id == owner.id))
        session.commit()


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _identity_payload(identity: Identity) -> dict[str, Any]:
    return {
        "id": identity.id,
        "username": identity.username,
        "role": identity.role,
        "status": identity.status,
        "last_active_at": identity.last_active_at,
        "created_at": identity.created_at,
        "password_set": bool(identity.password_hash),
    }


def _api_token_payload(token: ApiToken, include_identity: bool = False) -> dict[str, Any]:
    payload = {
        "id": token.id,
        "name": token.name,
        "prefix": token.token_prefix,
        "last_used_at": token.last_used_at,
        "expires_at": token.expires_at,
        "created_at": token.created_at,
        "projects": [
            {"id": grant.project.id, "slug": grant.project.slug, "name": grant.project.name}
            for grant in token.project_grants
        ],
    }
    if include_identity:
        payload["identity"] = {"id": token.identity.id, "username": token.identity.username}
    return payload


def _principal(request: Request) -> AuthPrincipal:
    principal = getattr(request.state, "identity", None)
    if not principal:
        raise HTTPException(401, "Sign in with a password or provide a valid bearer token")
    return principal


def _admin(principal: AuthPrincipal = Depends(_principal)) -> AuthPrincipal:
    if principal.role not in {"owner", "admin"}:
        raise HTTPException(403, "Admin access is required")
    return principal


def _project_id_for_request(session: Session, path: str) -> str | None:
    project_match = re.match(r"^/api/v1/projects/([^/]+)", path)
    if project_match:
        identifier = project_match.group(1)
        return session.scalar(select(Project.id).where((Project.id == identifier) | (Project.slug == identifier)))
    run_match = re.match(r"^/api/v1/runs/([^/]+)", path)
    if run_match:
        identifier = run_match.group(1)
        exact = session.scalar(select(Run.project_id).where(Run.id == identifier))
        if exact:
            return exact
        project_ids = list(session.scalars(select(Run.project_id).where(Run.display_id == identifier)))
        if len(project_ids) > 1:
            raise HTTPException(409, "Run display ID is ambiguous; use the full run ID")
        return project_ids[0] if project_ids else None
    artifact_match = re.match(r"^/api/v1/artifacts/([^/]+)", path)
    if artifact_match:
        return session.scalar(
            select(Run.project_id).join(Artifact, Artifact.run_id == Run.id).where(Artifact.id == artifact_match.group(1))
        )
    return None


def _authorize_project_request(session: Session, principal: AuthPrincipal, path: str, method: str) -> None:
    project_id = _project_id_for_request(session, path)
    if not project_id:
        return
    if principal.token_project_ids is not None and project_id not in principal.token_project_ids:
        raise HTTPException(403, "This API token is not authorized for this project")
    if principal.dev or principal.role in {"owner", "admin"}:
        return
    role = session.scalar(select(ProjectMembership.role).where(
        ProjectMembership.project_id == project_id,
        ProjectMembership.identity_id == principal.id,
    ))
    if not role:
        raise HTTPException(403, "You do not have access to this project")
    if method not in {"GET", "HEAD", "OPTIONS"} and role not in {"owner", "editor"}:
        raise HTTPException(403, "Editor access is required for this project")


def _delete_expired(session: Session) -> None:
    now = now_utc()
    session.execute(delete(AuthSession).where(AuthSession.expires_at < now))


def _set_session(response: Response, session: Session, identity: Identity) -> None:
    raw_token = secrets.token_urlsafe(32)
    expires = now_utc() + timedelta(hours=settings.session_ttl_hours)
    session.add(AuthSession(identity_id=identity.id, token_hash=_hash(raw_token), expires_at=expires))
    identity.last_active_at = now_utc()
    session.commit()
    response.set_cookie(
        SESSION_COOKIE,
        raw_token,
        max_age=settings.session_ttl_hours * 3600,
        expires=expires,
        httponly=True,
        secure=settings.secure_session_cookie,
        samesite="lax",
        path="/",
    )


async def authenticate_request(request: Request, call_next):
    request.state.identity = None
    if settings.dev:
        request.state.identity = AuthPrincipal("dev", "Development", "owner", "active", True)
        return await call_next(request)

    raw_token = request.cookies.get(SESSION_COOKIE)
    authorization = request.headers.get("authorization", "")
    bearer_token = authorization[7:].strip() if authorization.lower().startswith("bearer ") else None
    configured = False
    with SessionLocal() as session:
        configured = bool(session.scalar(select(func.count()).select_from(Identity)))
        if bearer_token:
            api_token = session.scalar(
                select(ApiToken)
                .options(selectinload(ApiToken.identity), selectinload(ApiToken.project_grants))
                .where(ApiToken.token_hash == _hash(bearer_token))
            )
            if (
                api_token
                and api_token.identity.status == "active"
                and (api_token.expires_at is None or _aware(api_token.expires_at) > now_utc())
            ):
                identity = api_token.identity
                request.state.identity = AuthPrincipal(
                    identity.id, identity.username, identity.role, identity.status,
                    token_project_ids=frozenset(grant.project_id for grant in api_token.project_grants),
                )
                if not api_token.last_used_at or now_utc() - _aware(api_token.last_used_at) > timedelta(minutes=5):
                    api_token.last_used_at = now_utc()
                    identity.last_active_at = now_utc()
                    session.commit()
        if raw_token and not request.state.identity:
            auth_session = session.scalar(
                select(AuthSession)
                .options(selectinload(AuthSession.identity))
                .where(AuthSession.token_hash == _hash(raw_token))
            )
            if auth_session and _aware(auth_session.expires_at) > now_utc() and auth_session.identity.status == "active":
                identity = auth_session.identity
                request.state.identity = AuthPrincipal(identity.id, identity.username, identity.role, identity.status)
                if not identity.last_active_at or now_utc() - _aware(identity.last_active_at) > timedelta(minutes=5):
                    identity.last_active_at = now_utc()
                    session.commit()
            elif auth_session:
                session.delete(auth_session)
                session.commit()

    path = request.url.path
    if path == "/health" or path.startswith("/api/v1/auth/"):
        return await call_next(request)
    if path.startswith("/api/") and not request.state.identity:
        detail = "This RunTrace instance needs an owner" if not configured else "Sign in with a password or provide a valid bearer token"
        return Response(content=json.dumps({"detail": detail}), status_code=428 if not configured else 401, media_type="application/json")
    if path.startswith("/api/") and request.state.identity:
        with SessionLocal() as session:
            try:
                _authorize_project_request(session, request.state.identity, path, request.method)
            except HTTPException as exc:
                return Response(content=json.dumps({"detail": exc.detail}), status_code=exc.status_code, media_type="application/json")
    return await call_next(request)


@router.get("/status")
def auth_status(request: Request, session: Session = Depends(get_db)) -> dict[str, Any]:
    principal = getattr(request.state, "identity", None)
    configured = bool(session.scalar(select(func.count()).select_from(Identity)))
    identity = session.get(Identity, principal.id) if principal and not principal.dev else None
    return {
        "dev": settings.dev,
        "configured": configured,
        "authenticated": bool(principal),
        "identity": None if not principal else {
            "id": principal.id,
            "username": principal.username,
            "role": principal.role,
            "status": principal.status,
            "password_set": True if principal.dev else bool(identity and identity.password_hash),
        },
    }


@router.post("/bootstrap", status_code=201)
def bootstrap(body: BootstrapRequest, response: Response, session: Session = Depends(get_db)) -> dict[str, Any]:
    if settings.dev:
        raise HTTPException(409, "Authentication is disabled in development mode")
    if session.scalar(select(func.count()).select_from(Identity)):
        raise HTTPException(409, "This instance already has an owner")
    username = body.username.strip().lower()
    identity = Identity(
        id=f"identity_{secrets.token_hex(16)}",
        username=username,
        role="owner",
        status="active",
        password_hash=_password_hash(body.password),
    )
    session.add(identity)
    try:
        session.flush()
        _set_session(response, session, identity)
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(409, "This instance already has an owner") from exc
    return {"identity": _identity_payload(identity)}


@router.post("/setup")
def setup(body: SetupRequest, response: Response, session: Session = Depends(get_db)) -> dict[str, Any]:
    token_hash = _hash(body.token)
    identity = session.scalar(select(Identity).where(Identity.setup_token_hash == token_hash))
    if not identity or not identity.setup_expires_at or _aware(identity.setup_expires_at) <= now_utc() or identity.status == "suspended":
        raise HTTPException(400, "This setup link is invalid or expired")
    identity.status = "active"
    identity.password_hash = _password_hash(body.password)
    identity.setup_token_hash = None
    identity.setup_expires_at = None
    _set_session(response, session, identity)
    return {"identity": _identity_payload(identity)}


@router.post("/login")
def login(body: LoginRequest, request: Request, response: Response, session: Session = Depends(get_db)) -> dict[str, Any]:
    login_key = _login_key(request, body.username)
    _check_login_limit(login_key)
    identity = session.scalar(select(Identity).where(Identity.username == body.username.strip().lower()))
    encoded = identity.password_hash if identity and identity.password_hash else _DUMMY_PASSWORD_HASH
    valid = _password_matches(body.password, encoded)
    if not identity or not valid or identity.status != "active":
        _record_login_failure(login_key)
        raise HTTPException(401, "Invalid name or password")
    _clear_login_failures(login_key)
    _set_session(response, session, identity)
    return {"identity": _identity_payload(identity)}


@router.post("/password")
def change_password(
    body: PasswordChangeRequest,
    response: Response,
    request: Request,
    session: Session = Depends(get_db),
    _: AuthPrincipal = Depends(_principal),
) -> dict[str, Any]:
    identity = session.get(Identity, request.state.identity.id)
    if not identity or (identity.password_hash and not _password_matches(body.current_password, identity.password_hash)):
        raise HTTPException(401, "Current password is incorrect")
    identity.password_hash = _password_hash(body.new_password)
    session.execute(delete(AuthSession).where(AuthSession.identity_id == identity.id))
    session.flush()
    _set_session(response, session, identity)
    return {"identity": _identity_payload(identity)}


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, session: Session = Depends(get_db)) -> None:
    raw_token = request.cookies.get(SESSION_COOKIE)
    if raw_token:
        session.execute(delete(AuthSession).where(AuthSession.token_hash == _hash(raw_token)))
        session.commit()
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, samesite="lax", secure=settings.secure_session_cookie)


@router.get("/tokens")
def list_api_tokens(
    request: Request,
    session: Session = Depends(get_db),
    _: AuthPrincipal = Depends(_principal),
) -> list[dict[str, Any]]:
    principal = request.state.identity
    query = select(ApiToken).options(
        selectinload(ApiToken.identity),
        selectinload(ApiToken.project_grants).selectinload(ApiTokenProject.project),
    ).order_by(ApiToken.created_at.desc())
    if principal.role not in {"owner", "admin"}:
        query = query.where(ApiToken.identity_id == principal.id)
    tokens = session.scalars(query).all()
    return [_api_token_payload(token, include_identity=principal.role in {"owner", "admin"}) for token in tokens]


@router.post("/tokens", status_code=201)
def create_api_token(
    body: ApiTokenCreateRequest,
    request: Request,
    session: Session = Depends(get_db),
    _: AuthPrincipal = Depends(_principal),
) -> dict[str, Any]:
    principal = request.state.identity
    project_ids = set(body.project_ids)
    if not project_ids:
        if principal.role in {"owner", "admin"}:
            project_ids = set(session.scalars(select(Project.id)))
        else:
            project_ids = set(session.scalars(select(ProjectMembership.project_id).where(ProjectMembership.identity_id == principal.id)))
    if not project_ids:
        raise HTTPException(400, "Select at least one project for this token")
    projects = session.scalars(select(Project).where(Project.id.in_(project_ids))).all()
    if len(projects) != len(project_ids):
        raise HTTPException(400, "One or more projects do not exist")
    if principal.role not in {"owner", "admin"}:
        accessible = set(session.scalars(select(ProjectMembership.project_id).where(
            ProjectMembership.identity_id == principal.id,
            ProjectMembership.project_id.in_(project_ids),
        )))
        if accessible != project_ids:
            raise HTTPException(403, "You can only create tokens for projects you can access")
    raw_token = f"rt_{secrets.token_urlsafe(32)}"
    token = ApiToken(
        identity_id=request.state.identity.id,
        name=body.name.strip(),
        token_hash=_hash(raw_token),
        token_prefix=raw_token[:11],
        expires_at=now_utc() + timedelta(days=body.expires_in_days) if body.expires_in_days else None,
    )
    session.add(token)
    session.flush()
    session.add_all(ApiTokenProject(api_token_id=token.id, project_id=project_id) for project_id in project_ids)
    session.commit()
    session.refresh(token)
    token = session.scalar(select(ApiToken).options(
        selectinload(ApiToken.project_grants).selectinload(ApiTokenProject.project)
    ).where(ApiToken.id == token.id))
    return {"token": raw_token, "api_token": _api_token_payload(token)}


@router.delete("/tokens/{token_id}", status_code=204)
def revoke_api_token(
    token_id: str,
    request: Request,
    session: Session = Depends(get_db),
    _: AuthPrincipal = Depends(_principal),
) -> None:
    principal = request.state.identity
    query = select(ApiToken).where(ApiToken.id == token_id)
    if principal.role not in {"owner", "admin"}:
        query = query.where(ApiToken.identity_id == principal.id)
    token = session.scalar(query)
    if not token:
        raise HTTPException(404, "API token not found")
    session.delete(token)
    session.commit()


def _project_admin(session: Session, project_id: str, principal: AuthPrincipal) -> None:
    if principal.dev or principal.role in {"owner", "admin"}:
        return
    role = session.scalar(select(ProjectMembership.role).where(
        ProjectMembership.project_id == project_id,
        ProjectMembership.identity_id == principal.id,
    ))
    if role != "owner":
        raise HTTPException(403, "Project owner access is required")


def _project(session: Session, identifier: str) -> Project:
    project = session.scalar(select(Project).where((Project.id == identifier) | (Project.slug == identifier)))
    if not project:
        raise HTTPException(404, "Project not found")
    return project


def _member_payload(membership: ProjectMembership) -> dict[str, Any]:
    return {
        "identity": _identity_payload(membership.identity),
        "role": membership.role,
        "created_at": membership.created_at,
        "updated_at": membership.updated_at,
    }


@router.get("/projects/{project}/members")
def list_project_members(project: str, session: Session = Depends(get_db), principal: AuthPrincipal = Depends(_principal)) -> list[dict[str, Any]]:
    current = _project(session, project)
    _project_admin(session, current.id, principal)
    memberships = session.scalars(select(ProjectMembership).options(selectinload(ProjectMembership.identity)).where(
        ProjectMembership.project_id == current.id
    ).order_by(ProjectMembership.created_at)).all()
    return [_member_payload(membership) for membership in memberships]


@router.post("/projects/{project}/members", status_code=201)
def add_project_member(project: str, body: ProjectMemberRequest, session: Session = Depends(get_db), principal: AuthPrincipal = Depends(_principal)) -> dict[str, Any]:
    current = _project(session, project)
    _project_admin(session, current.id, principal)
    identity = session.get(Identity, body.identity_id) if body.identity_id else session.scalar(select(Identity).where(Identity.username == (body.username or "").strip().lower()))
    if not identity:
        raise HTTPException(404, "Identity not found")
    if session.scalar(select(ProjectMembership.id).where(ProjectMembership.project_id == current.id, ProjectMembership.identity_id == identity.id)):
        raise HTTPException(409, "This identity already has project access")
    membership = ProjectMembership(project_id=current.id, identity_id=identity.id, role=body.role)
    session.add(membership)
    session.commit()
    membership = session.scalar(select(ProjectMembership).options(selectinload(ProjectMembership.identity)).where(ProjectMembership.id == membership.id))
    return _member_payload(membership)


@router.patch("/projects/{project}/members/{identity_id}")
def update_project_member(project: str, identity_id: str, body: ProjectMemberUpdateRequest, session: Session = Depends(get_db), principal: AuthPrincipal = Depends(_principal)) -> dict[str, Any]:
    current = _project(session, project)
    _project_admin(session, current.id, principal)
    membership = session.scalar(select(ProjectMembership).options(selectinload(ProjectMembership.identity)).where(
        ProjectMembership.project_id == current.id, ProjectMembership.identity_id == identity_id
    ))
    if not membership:
        raise HTTPException(404, "Project membership not found")
    if membership.role == "owner" and body.role != "owner":
        owners = session.scalar(select(func.count()).select_from(ProjectMembership).where(ProjectMembership.project_id == current.id, ProjectMembership.role == "owner")) or 0
        if owners <= 1:
            raise HTTPException(409, "A project must have at least one owner")
    membership.role = body.role
    session.commit()
    session.refresh(membership)
    return _member_payload(membership)


@router.delete("/projects/{project}/members/{identity_id}", status_code=204)
def remove_project_member(project: str, identity_id: str, session: Session = Depends(get_db), principal: AuthPrincipal = Depends(_principal)) -> None:
    current = _project(session, project)
    _project_admin(session, current.id, principal)
    membership = session.scalar(select(ProjectMembership).where(ProjectMembership.project_id == current.id, ProjectMembership.identity_id == identity_id))
    if not membership:
        raise HTTPException(404, "Project membership not found")
    if membership.role == "owner":
        owners = session.scalar(select(func.count()).select_from(ProjectMembership).where(ProjectMembership.project_id == current.id, ProjectMembership.role == "owner")) or 0
        if owners <= 1:
            raise HTTPException(409, "A project must have at least one owner")
    session.delete(membership)
    session.commit()


@router.get("/identities")
def list_identities(session: Session = Depends(get_db), _: AuthPrincipal = Depends(_admin)) -> list[dict[str, Any]]:
    identities = session.scalars(select(Identity).order_by(Identity.created_at)).all()
    return [_identity_payload(identity) for identity in identities]


@router.post("/identities", status_code=201)
def create_identity(
    body: IdentityCreateRequest,
    session: Session = Depends(get_db),
    _: AuthPrincipal = Depends(_admin),
) -> dict[str, Any]:
    username = body.username.strip().lower()
    if session.scalar(select(Identity.id).where(Identity.username == username)):
        raise HTTPException(409, "An identity with this username already exists")
    identity = Identity(username=username, role=body.role, status="pending")
    session.add(identity)
    session.flush()
    setup_token = _refresh_setup_token(identity)
    session.commit()
    session.refresh(identity)
    return {"identity": _identity_payload(identity), "setup_token": setup_token, "setup_path": f"/?setup={setup_token}"}


def _refresh_setup_token(identity: Identity) -> str:
    setup_token = secrets.token_urlsafe(32)
    identity.setup_token_hash = _hash(setup_token)
    identity.setup_expires_at = now_utc() + timedelta(hours=settings.setup_link_ttl_hours)
    return setup_token


@router.post("/identities/{identity_id}/setup-link")
def refresh_setup_link(
    identity_id: str,
    session: Session = Depends(get_db),
    _: AuthPrincipal = Depends(_admin),
) -> dict[str, str]:
    identity = session.get(Identity, identity_id)
    if not identity or identity.role == "owner" or identity.status == "suspended":
        raise HTTPException(404, "Identity is not eligible for a setup link")
    setup_token = _refresh_setup_token(identity)
    if identity.status != "active":
        identity.status = "pending"
    session.commit()
    return {"setup_token": setup_token, "setup_path": f"/?setup={setup_token}"}


@router.patch("/identities/{identity_id}")
def update_identity(
    identity_id: str,
    body: IdentityUpdateRequest,
    session: Session = Depends(get_db),
    principal: AuthPrincipal = Depends(_admin),
) -> dict[str, Any]:
    identity = session.get(Identity, identity_id)
    if not identity:
        raise HTTPException(404, "Identity not found")
    if identity.role == "owner":
        raise HTTPException(409, "The instance owner cannot be changed or suspended")
    if identity.id == principal.id and body.status == "suspended":
        raise HTTPException(409, "You cannot suspend your own identity")
    if body.role is not None:
        identity.role = body.role
    if body.status is not None:
        identity.status = body.status
        if body.status == "suspended":
            session.execute(delete(AuthSession).where(AuthSession.identity_id == identity.id))
            session.execute(delete(ApiToken).where(ApiToken.identity_id == identity.id))
    session.commit()
    session.refresh(identity)
    return _identity_payload(identity)
