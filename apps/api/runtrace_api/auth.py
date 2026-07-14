from __future__ import annotations

import hashlib
import json
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, options_to_json
from webauthn.helpers.exceptions import InvalidAuthenticationResponse, InvalidRegistrationResponse
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    AuthenticatorTransport,
    UserVerificationRequirement,
)

from .config import settings
from .database import SessionLocal, get_db
from .models import ApiToken, AuthCeremony, AuthSession, Identity, PasskeyCredential, now_utc


SESSION_COOKIE = "runtrace_session"
CEREMONY_TTL = timedelta(minutes=5)
router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])


@dataclass(frozen=True)
class AuthPrincipal:
    id: str
    name: str
    role: str
    status: str
    dev: bool = False


class BootstrapOptionsRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class SetupOptionsRequest(BaseModel):
    token: str = Field(min_length=32, max_length=256)


class RegistrationVerifyRequest(BaseModel):
    ceremony_id: str
    credential: dict[str, Any]
    passkey_name: str = Field(default="Passkey", min_length=1, max_length=120)


class AuthenticationVerifyRequest(BaseModel):
    ceremony_id: str
    credential: dict[str, Any]


class IdentityCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    role: Literal["admin", "member"] = "member"


class IdentityUpdateRequest(BaseModel):
    role: Literal["admin", "member"] | None = None
    status: Literal["active", "suspended"] | None = None


class PasskeyNameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ApiTokenCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    expires_in_days: int | None = Field(default=None, ge=1, le=365)


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _identity_payload(identity: Identity, include_passkeys: bool = True) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": identity.id,
        "name": identity.name,
        "role": identity.role,
        "status": identity.status,
        "last_active_at": identity.last_active_at,
        "created_at": identity.created_at,
    }
    if include_passkeys:
        payload["passkeys"] = [
            {
                "id": item.id,
                "name": item.name,
                "device_type": item.device_type,
                "backed_up": item.backed_up,
                "transports": item.transports,
                "last_used_at": item.last_used_at,
                "created_at": item.created_at,
            }
            for item in sorted(identity.passkeys, key=lambda value: value.created_at)
        ]
    return payload


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
        raise HTTPException(401, "Sign in with a passkey or provide a valid bearer token")
    return principal


def _admin(principal: AuthPrincipal = Depends(_principal)) -> AuthPrincipal:
    if principal.role not in {"owner", "admin"}:
        raise HTTPException(403, "Admin access is required")
    return principal


def _delete_expired(session: Session) -> None:
    now = now_utc()
    session.execute(delete(AuthCeremony).where(AuthCeremony.expires_at < now))
    session.execute(delete(AuthSession).where(AuthSession.expires_at < now))


def _new_ceremony(
    session: Session,
    ceremony: str,
    challenge: bytes,
    identity_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> AuthCeremony:
    item = AuthCeremony(
        ceremony=ceremony,
        challenge=challenge,
        identity_id=identity_id,
        payload=payload or {},
        expires_at=now_utc() + CEREMONY_TTL,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


def _consume_ceremony(session: Session, ceremony_id: str, expected: str) -> AuthCeremony:
    item = session.get(AuthCeremony, ceremony_id)
    if not item or item.ceremony != expected or _aware(item.expires_at) <= now_utc():
        if item:
            session.delete(item)
            session.commit()
        raise HTTPException(400, "This passkey request expired. Please try again.")
    session.delete(item)
    session.flush()
    return item


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


def _registration_options(session: Session, identity: Identity, ceremony_name: str) -> dict[str, Any]:
    challenge = secrets.token_bytes(32)
    exclude = [PublicKeyCredentialDescriptor(
        id=item.credential_id,
        transports=[AuthenticatorTransport(value) for value in item.transports if value in AuthenticatorTransport._value2member_map_],
    ) for item in identity.passkeys]
    options = generate_registration_options(
        rp_id=settings.webauthn_rp_id,
        rp_name=settings.webauthn_rp_name,
        user_id=identity.id.encode(),
        user_name=identity.id,
        user_display_name=identity.name,
        challenge=challenge,
        exclude_credentials=exclude,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
    )
    ceremony = _new_ceremony(session, ceremony_name, challenge, identity.id)
    return {"ceremony_id": ceremony.id, "options": json.loads(options_to_json(options))}


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
        detail = "This RunTrace instance needs an owner" if not configured else "Sign in with a passkey or provide a valid bearer token"
        return Response(content=json.dumps({"detail": detail}), status_code=428 if not configured else 401, media_type="application/json")
    return await call_next(request)


@router.get("/status")
def auth_status(request: Request, session: Session = Depends(get_db)) -> dict[str, Any]:
    principal = getattr(request.state, "identity", None)
    configured = bool(session.scalar(select(func.count()).select_from(Identity)))
    return {
        "dev": settings.dev,
        "configured": configured,
        "authenticated": bool(principal),
        "identity": None if not principal else {
            "id": principal.id,
            "name": principal.name,
            "role": principal.role,
            "status": principal.status,
        },
    }


@router.post("/bootstrap/options")
def bootstrap_options(body: BootstrapOptionsRequest, session: Session = Depends(get_db)) -> dict[str, Any]:
    if settings.dev:
        raise HTTPException(409, "Authentication is disabled in development mode")
    if session.scalar(select(func.count()).select_from(Identity)):
        raise HTTPException(409, "This instance already has an owner")
    name = body.name.strip()
    identity = Identity(id=f"identity_{secrets.token_hex(16)}", name=name, role="owner", status="pending")
    challenge = secrets.token_bytes(32)
    options = generate_registration_options(
        rp_id=settings.webauthn_rp_id,
        rp_name=settings.webauthn_rp_name,
        user_id=identity.id.encode(),
        user_name=identity.id,
        user_display_name=identity.name,
        challenge=challenge,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
    )
    ceremony = _new_ceremony(session, "bootstrap", challenge, payload={
        "identity_id": identity.id,
        "name": identity.name,
    })
    return {"ceremony_id": ceremony.id, "options": json.loads(options_to_json(options))}


@router.post("/setup/options")
def setup_options(body: SetupOptionsRequest, session: Session = Depends(get_db)) -> dict[str, Any]:
    token_hash = _hash(body.token)
    identity = session.scalar(
        select(Identity)
        .options(selectinload(Identity.passkeys))
        .where(Identity.setup_token_hash == token_hash)
    )
    if not identity or not identity.setup_expires_at or _aware(identity.setup_expires_at) <= now_utc() or identity.status == "suspended":
        raise HTTPException(400, "This setup link is invalid or expired")
    result = _registration_options(session, identity, "setup")
    ceremony = session.get(AuthCeremony, result["ceremony_id"])
    if ceremony:
        ceremony.payload = {"setup_token_hash": token_hash}
        session.commit()
    return result


@router.post("/passkeys/options")
def add_passkey_options(
    request: Request,
    session: Session = Depends(get_db),
    _: AuthPrincipal = Depends(_principal),
) -> dict[str, Any]:
    identity = session.scalar(select(Identity).options(selectinload(Identity.passkeys)).where(Identity.id == request.state.identity.id))
    if not identity:
        raise HTTPException(404, "Identity not found")
    return _registration_options(session, identity, "add_passkey")


@router.post("/registration/verify")
def registration_verify(body: RegistrationVerifyRequest, response: Response, session: Session = Depends(get_db)) -> dict[str, Any]:
    ceremony = _consume_ceremony(session, body.ceremony_id, "bootstrap")
    if session.scalar(select(func.count()).select_from(Identity)):
        session.rollback()
        raise HTTPException(409, "This instance already has an owner")
    identity = Identity(
        id=ceremony.payload["identity_id"],
        name=ceremony.payload["name"],
        role="owner",
        status="active",
    )
    try:
        return _verify_and_save_registration(body, response, session, ceremony, identity, create_identity=True)
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(409, "This instance already has an owner") from exc


@router.post("/setup/verify")
def setup_verify(body: RegistrationVerifyRequest, response: Response, session: Session = Depends(get_db)) -> dict[str, Any]:
    ceremony = _consume_ceremony(session, body.ceremony_id, "setup")
    identity = session.get(Identity, ceremony.identity_id)
    if not identity or identity.status == "suspended" or identity.setup_token_hash != ceremony.payload.get("setup_token_hash"):
        session.rollback()
        raise HTTPException(400, "Identity is no longer available")
    identity.status = "active"
    identity.setup_token_hash = None
    identity.setup_expires_at = None
    return _verify_and_save_registration(body, response, session, ceremony, identity)


@router.post("/passkeys/verify")
def add_passkey_verify(
    body: RegistrationVerifyRequest,
    response: Response,
    request: Request,
    session: Session = Depends(get_db),
    _: AuthPrincipal = Depends(_principal),
) -> dict[str, Any]:
    ceremony = _consume_ceremony(session, body.ceremony_id, "add_passkey")
    if ceremony.identity_id != request.state.identity.id:
        session.rollback()
        raise HTTPException(403, "Passkey request belongs to another identity")
    identity = session.get(Identity, ceremony.identity_id)
    if not identity:
        raise HTTPException(404, "Identity not found")
    return _verify_and_save_registration(body, response, session, ceremony, identity)


def _verify_and_save_registration(
    body: RegistrationVerifyRequest,
    response: Response,
    session: Session,
    ceremony: AuthCeremony,
    identity: Identity,
    create_identity: bool = False,
) -> dict[str, Any]:
    try:
        verified = verify_registration_response(
            credential=body.credential,
            expected_challenge=ceremony.challenge,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=settings.webauthn_origin_list,
            require_user_verification=True,
        )
    except InvalidRegistrationResponse as exc:
        session.rollback()
        raise HTTPException(400, f"Passkey verification failed: {exc}") from exc
    if session.scalar(select(PasskeyCredential.id).where(PasskeyCredential.credential_id == verified.credential_id)):
        session.rollback()
        raise HTTPException(409, "This passkey is already registered")
    if create_identity:
        session.add(identity)
        session.flush()
    transports = body.credential.get("response", {}).get("transports", [])
    session.add(PasskeyCredential(
        identity_id=identity.id,
        credential_id=verified.credential_id,
        public_key=verified.credential_public_key,
        sign_count=verified.sign_count,
        device_type=verified.credential_device_type.value,
        backed_up=verified.credential_backed_up,
        transports=transports,
        name=body.passkey_name.strip(),
    ))
    _set_session(response, session, identity)
    return {"identity": _identity_payload(identity, include_passkeys=False)}


@router.post("/login/options")
def login_options(session: Session = Depends(get_db)) -> dict[str, Any]:
    if not session.scalar(select(func.count()).select_from(Identity).where(Identity.status == "active")):
        raise HTTPException(409, "No active identities are configured")
    challenge = secrets.token_bytes(32)
    options = generate_authentication_options(
        rp_id=settings.webauthn_rp_id,
        challenge=challenge,
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    ceremony = _new_ceremony(session, "authentication", challenge)
    return {"ceremony_id": ceremony.id, "options": json.loads(options_to_json(options))}


@router.post("/login/verify")
def login_verify(body: AuthenticationVerifyRequest, response: Response, session: Session = Depends(get_db)) -> dict[str, Any]:
    ceremony = _consume_ceremony(session, body.ceremony_id, "authentication")
    try:
        credential_id = base64url_to_bytes(body.credential["id"])
    except (KeyError, TypeError, ValueError) as exc:
        session.rollback()
        raise HTTPException(400, "Invalid passkey response") from exc
    passkey = session.scalar(
        select(PasskeyCredential)
        .options(selectinload(PasskeyCredential.identity))
        .where(PasskeyCredential.credential_id == credential_id)
    )
    if not passkey or passkey.identity.status != "active":
        session.rollback()
        raise HTTPException(401, "Passkey is not registered to an active identity")
    try:
        verified = verify_authentication_response(
            credential=body.credential,
            expected_challenge=ceremony.challenge,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=settings.webauthn_origin_list,
            credential_public_key=passkey.public_key,
            credential_current_sign_count=passkey.sign_count,
            require_user_verification=True,
        )
    except InvalidAuthenticationResponse as exc:
        session.rollback()
        raise HTTPException(401, f"Passkey verification failed: {exc}") from exc
    passkey.sign_count = verified.new_sign_count
    passkey.last_used_at = now_utc()
    _set_session(response, session, passkey.identity)
    return {"identity": _identity_payload(passkey.identity, include_passkeys=False)}


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
    identities = session.scalars(select(Identity).options(selectinload(Identity.passkeys)).order_by(Identity.created_at)).all()
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
    identity = session.scalar(select(Identity).options(selectinload(Identity.passkeys)).where(Identity.id == identity_id))
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


@router.delete("/identities/{identity_id}/passkeys/{passkey_id}", status_code=204)
def revoke_passkey(
    identity_id: str,
    passkey_id: str,
    session: Session = Depends(get_db),
    _: AuthPrincipal = Depends(_admin),
) -> None:
    identity = session.scalar(select(Identity).options(selectinload(Identity.passkeys)).where(Identity.id == identity_id))
    if not identity:
        raise HTTPException(404, "Identity not found")
    passkey = next((item for item in identity.passkeys if item.id == passkey_id), None)
    if not passkey:
        raise HTTPException(404, "Passkey not found")
    if identity.role == "owner" and len(identity.passkeys) == 1:
        raise HTTPException(409, "The owner's only passkey cannot be revoked")
    session.delete(passkey)
    session.execute(delete(AuthSession).where(AuthSession.identity_id == identity.id))
    session.commit()


@router.patch("/passkeys/{passkey_id}")
def rename_passkey(
    passkey_id: str,
    body: PasskeyNameRequest,
    request: Request,
    session: Session = Depends(get_db),
    _: AuthPrincipal = Depends(_principal),
) -> dict[str, Any]:
    passkey = session.scalar(select(PasskeyCredential).where(
        PasskeyCredential.id == passkey_id,
        PasskeyCredential.identity_id == request.state.identity.id,
    ))
    if not passkey:
        raise HTTPException(404, "Passkey not found")
    passkey.name = body.name.strip()
    session.commit()
    return {"id": passkey.id, "name": passkey.name}
