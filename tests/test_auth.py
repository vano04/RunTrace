import hashlib
from datetime import timedelta

from runtrace_api.config import settings
from runtrace_api.database import SessionLocal
from runtrace_api.models import ApiToken, AuthSession, Identity, now_utc


def test_dev_mode_bypasses_authentication(fresh_database):
    status = fresh_database.get("/api/v1/auth/status")
    assert status.status_code == 200
    assert status.json()["dev"] is True
    assert status.json()["identity"]["role"] == "owner"
    assert fresh_database.get("/api/v1/projects").status_code == 200


def test_normal_mode_requires_bootstrap_then_a_session(fresh_database, monkeypatch):
    monkeypatch.setattr(settings, "dev", False)
    status = fresh_database.get("/api/v1/auth/status").json()
    assert status == {"dev": False, "configured": False, "authenticated": False, "identity": None}
    blocked = fresh_database.get("/api/v1/projects")
    assert blocked.status_code == 428

    with SessionLocal() as session:
        session.add(Identity(name="Owner", role="owner", status="active"))
        session.commit()

    assert fresh_database.get("/api/v1/projects").status_code == 401


def test_admin_can_create_identity_and_suspend_access(fresh_database, monkeypatch):
    monkeypatch.setattr(settings, "dev", False)
    raw_token = "test-session-token"
    with SessionLocal() as session:
        owner = Identity(name="Owner", role="owner", status="active")
        session.add(owner)
        session.flush()
        session.add(AuthSession(
            identity_id=owner.id,
            token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
            expires_at=now_utc() + timedelta(hours=1),
        ))
        session.commit()
    fresh_database.cookies.set("runtrace_session", raw_token)

    created = fresh_database.post("/api/v1/auth/identities", json={
        "name": "Ada Lovelace",
        "role": "admin",
    })
    assert created.status_code == 201
    payload = created.json()
    assert payload["identity"]["status"] == "pending"
    assert payload["identity"]["role"] == "admin"
    assert payload["setup_path"].startswith("/?setup=")
    assert "setup_token" in payload

    identity_id = payload["identity"]["id"]
    replacement = fresh_database.post(f"/api/v1/auth/identities/{identity_id}/setup-link")
    assert replacement.status_code == 200
    assert replacement.json()["setup_token"] != payload["setup_token"]
    assert fresh_database.post("/api/v1/auth/setup/options", json={"token": payload["setup_token"]}).status_code == 400
    assert fresh_database.post("/api/v1/auth/setup/options", json={"token": replacement.json()["setup_token"]}).status_code == 200

    suspended = fresh_database.patch(f"/api/v1/auth/identities/{identity_id}", json={"status": "suspended"})
    assert suspended.status_code == 200
    assert suspended.json()["status"] == "suspended"

    identities = fresh_database.get("/api/v1/auth/identities").json()
    assert {item["name"] for item in identities} == {"Owner", "Ada Lovelace"}


def test_owner_cannot_be_demoted_or_suspended(fresh_database, monkeypatch):
    monkeypatch.setattr(settings, "dev", False)
    raw_token = "owner-session-token"
    with SessionLocal() as session:
        owner = Identity(name="Owner", role="owner", status="active")
        session.add(owner)
        session.flush()
        owner_id = owner.id
        session.add(AuthSession(
            identity_id=owner.id,
            token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
            expires_at=now_utc() + timedelta(hours=1),
        ))
        session.commit()
    fresh_database.cookies.set("runtrace_session", raw_token)
    response = fresh_database.patch(f"/api/v1/auth/identities/{owner_id}", json={"status": "suspended"})
    assert response.status_code == 409


def test_api_token_authentication_and_revocation(fresh_database, monkeypatch):
    monkeypatch.setattr(settings, "dev", False)
    raw_session = "owner-session-token"
    with SessionLocal() as session:
        owner = Identity(name="Owner", role="owner", status="active")
        session.add(owner)
        session.flush()
        session.add(AuthSession(
            identity_id=owner.id,
            token_hash=hashlib.sha256(raw_session.encode()).hexdigest(),
            expires_at=now_utc() + timedelta(hours=1),
        ))
        session.commit()
    fresh_database.cookies.set("runtrace_session", raw_session)

    created = fresh_database.post("/api/v1/auth/tokens", json={"name": "Codex", "expires_in_days": 30})
    assert created.status_code == 201
    secret = created.json()["token"]
    token_id = created.json()["api_token"]["id"]
    assert secret.startswith("rt_")
    assert "token" not in fresh_database.get("/api/v1/auth/tokens").json()[0]

    fresh_database.cookies.clear()
    headers = {"Authorization": f"Bearer {secret}"}
    assert fresh_database.get("/api/v1/projects", headers=headers).status_code == 200
    with SessionLocal() as session:
        stored = session.get(ApiToken, token_id)
        assert stored is not None
        assert stored.token_hash != secret
        assert stored.last_used_at is not None

    assert fresh_database.delete(f"/api/v1/auth/tokens/{token_id}", headers=headers).status_code == 204
    assert fresh_database.get("/api/v1/projects", headers=headers).status_code == 401
