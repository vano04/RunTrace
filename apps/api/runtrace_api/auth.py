from __future__ import annotations

import hashlib
import json
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
from .models import ApiToken, AuthSession, Identity, now_utc


SESSION_COOKIE = "runtrace_session"
LOGIN_ATTEMPT_LIMIT = 10
LOGIN_ATTEMPT_WINDOW_SECONDS = 300
_login_attempts: dict[str, list[float]] = {}
_login_attempts_lock = Lock()
router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])


@dataclass(frozen=True)
class AuthPrincipal:
    id: str
    name: str
    role: str
    status: str
    dev: bool = False


class BootstrapRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=12, max_length=1024)


class SetupRequest(BaseModel):
    token: str = Field(min_length=32, max_length=256)
    password: str = Field(min_length=12, max_length=1024)


class LoginRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=1024)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    new_password: str = Field(min_length=12, max_length=1024)


class IdentityCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    role: Literal["admin", "member"] = "member"


class IdentityUpdateRequest(BaseModel):
    role: Literal["admin", "member"] | None = None
    status: Literal["active", "suspended"] | None = None


class ApiTokenCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    expires_in_days: int | None = Field(default=None, ge=1, le=365)


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


def _login_key(request: Request, name: str) -> str:
    host = request.client.host if request.client else "unknown"
    return f"{host}:{name.strip().lower()}"


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
        "name": identity.name,
        "role": identity.role,
        "status": identity.status,
        "last_active_at": identity.last_active_at,
        "created_at": identity.created_at,
        "password_set": bool(identity.password_hash),
    }


def _api_token_payload(token: ApiToken) -> dict[str, Any]:
    return {
        "id": token.id,
        "name": token.name,
        "prefix": token.token_prefix,
        "last_used_at": token.last_used_at,
        "expires_at": token.expires_at,
        "created_at": token.created_at,
    }


def _principal(request: Request) -> AuthPrincipal:
    principal = getattr(request.state, "identity", None)
    if not principal:
        raise HTTPException(401, "Sign in with a password or provide a valid bearer token")
    return principal


def _admin(principal: AuthPrincipal = Depends(_principal)) -> AuthPrincipal:
    if principal.role not in {"owner", "admin"}:
        raise HTTPException(403, "Admin access is required")
    return principal


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
                .options(selectinload(ApiToken.identity))
                .where(ApiToken.token_hash == _hash(bearer_token))
            )
            if (
                api_token
                and api_token.identity.status == "active"
                and (api_token.expires_at is None or _aware(api_token.expires_at) > now_utc())
            ):
                identity = api_token.identity
                request.state.identity = AuthPrincipal(identity.id, identity.name, identity.role, identity.status)
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
                request.state.identity = AuthPrincipal(identity.id, identity.name, identity.role, identity.status)
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
            "name": principal.name,
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
    name = body.name.strip()
    identity = Identity(
        id=f"identity_{secrets.token_hex(16)}",
        name=name,
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
    login_key = _login_key(request, body.name)
    _check_login_limit(login_key)
    identity = session.scalar(select(Identity).where(func.lower(Identity.name) == body.name.strip().lower()))
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
    tokens = session.scalars(
        select(ApiToken)
        .where(ApiToken.identity_id == request.state.identity.id)
        .order_by(ApiToken.created_at.desc())
    ).all()
    return [_api_token_payload(token) for token in tokens]


@router.post("/tokens", status_code=201)
def create_api_token(
    body: ApiTokenCreateRequest,
    request: Request,
    session: Session = Depends(get_db),
    _: AuthPrincipal = Depends(_principal),
) -> dict[str, Any]:
    raw_token = f"rt_{secrets.token_urlsafe(32)}"
    token = ApiToken(
        identity_id=request.state.identity.id,
        name=body.name.strip(),
        token_hash=_hash(raw_token),
        token_prefix=raw_token[:11],
        expires_at=now_utc() + timedelta(days=body.expires_in_days) if body.expires_in_days else None,
    )
    session.add(token)
    session.commit()
    session.refresh(token)
    return {"token": raw_token, "api_token": _api_token_payload(token)}


@router.delete("/tokens/{token_id}", status_code=204)
def revoke_api_token(
    token_id: str,
    request: Request,
    session: Session = Depends(get_db),
    _: AuthPrincipal = Depends(_principal),
) -> None:
    token = session.scalar(select(ApiToken).where(
        ApiToken.id == token_id,
        ApiToken.identity_id == request.state.identity.id,
    ))
    if not token:
        raise HTTPException(404, "API token not found")
    session.delete(token)
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
    name = body.name.strip()
    if session.scalar(select(Identity.id).where(func.lower(Identity.name) == name.lower())):
        raise HTTPException(409, "An identity with this name already exists")
    identity = Identity(name=name, role=body.role, status="pending")
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
