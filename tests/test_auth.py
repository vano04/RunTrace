import hashlib
from datetime import timedelta

from sqlalchemy import select

from runtrace_api.auth import apply_owner_recovery_password
from runtrace_api.config import settings
from runtrace_api.database import SessionLocal
from runtrace_api.models import ApiToken, AuthSession, Identity, ProjectMembership, now_utc


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
        session.add(Identity(username="owner", role="owner", status="active"))
        session.commit()

    assert fresh_database.get("/api/v1/projects").status_code == 401


def test_owner_bootstrap_and_password_login(fresh_database, monkeypatch):
    monkeypatch.setattr(settings, "dev", False)
    created = fresh_database.post("/api/v1/auth/bootstrap", json={
        "username": "owner",
        "password": "correct horse battery staple",
    })
    assert created.status_code == 201
    assert created.json()["identity"]["password_set"] is True
    assert fresh_database.get("/api/v1/projects").status_code == 200

    with SessionLocal() as session:
        owner = session.scalar(select(Identity).where(Identity.username == "owner"))
        assert owner is not None
        assert owner.password_hash != "correct horse battery staple"

    assert fresh_database.post("/api/v1/auth/logout").status_code == 204
    assert fresh_database.post("/api/v1/auth/login", json={"username": "owner", "password": "wrong password"}).status_code == 401
    signed_in = fresh_database.post("/api/v1/auth/login", json={
        "username": "OWNER",
        "password": "correct horse battery staple",
    })
    assert signed_in.status_code == 200
    assert fresh_database.get("/api/v1/projects").status_code == 200

    changed = fresh_database.post("/api/v1/auth/password", json={
        "current_password": "correct horse battery staple",
        "new_password": "an even better replacement password",
    })
    assert changed.status_code == 200
    assert fresh_database.post("/api/v1/auth/logout").status_code == 204
    assert fresh_database.post("/api/v1/auth/login", json={
        "username": "owner",
        "password": "correct horse battery staple",
    }).status_code == 401
    assert fresh_database.post("/api/v1/auth/login", json={
        "username": "owner",
        "password": "an even better replacement password",
    }).status_code == 200


def test_owner_recovery_password_initializes_legacy_owner(fresh_database, monkeypatch):
    monkeypatch.setattr(settings, "dev", False)
    monkeypatch.setattr(settings, "owner_recovery_password", "temporary recovery password")
    with SessionLocal() as session:
        owner = Identity(username="owner", role="owner", status="active")
        session.add(owner)
        session.commit()
        apply_owner_recovery_password(session)
        assert owner.password_hash

    assert fresh_database.post("/api/v1/auth/login", json={
        "username": "owner",
        "password": "temporary recovery password",
    }).status_code == 200


def test_admin_can_create_identity_and_suspend_access(fresh_database, monkeypatch):
    monkeypatch.setattr(settings, "dev", False)
    raw_token = "test-session-token"
    with SessionLocal() as session:
        owner = Identity(username="owner", role="owner", status="active")
        session.add(owner)
        session.flush()
        session.add(AuthSession(
            identity_id=owner.id,
            token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
            expires_at=now_utc() + timedelta(hours=1),
        ))
        session.commit()
    fresh_database.cookies.clear()
    fresh_database.cookies.set("runtrace_session", raw_token)

    created = fresh_database.post("/api/v1/auth/identities", json={
        "username": "ada",
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
    assert fresh_database.post("/api/v1/auth/setup", json={"token": payload["setup_token"], "password": "a secure old password"}).status_code == 400
    assert fresh_database.post("/api/v1/auth/setup", json={"token": replacement.json()["setup_token"], "password": "a secure new password"}).status_code == 200

    fresh_database.cookies.clear()
    fresh_database.cookies.set("runtrace_session", raw_token)
    suspended = fresh_database.patch(f"/api/v1/auth/identities/{identity_id}", json={"status": "suspended"})
    assert suspended.status_code == 200
    assert suspended.json()["status"] == "suspended"

    identities = fresh_database.get("/api/v1/auth/identities").json()
    assert {item["username"] for item in identities} == {"owner", "ada"}


def test_owner_cannot_be_demoted_or_suspended(fresh_database, monkeypatch):
    monkeypatch.setattr(settings, "dev", False)
    raw_token = "owner-session-token"
    with SessionLocal() as session:
        owner = Identity(username="owner", role="owner", status="active")
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
        owner = Identity(username="owner", role="owner", status="active")
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


def test_project_memberships_scoped_tokens_and_admin_token_control(fresh_database, monkeypatch):
    monkeypatch.setattr(settings, "dev", False)
    owner_session = "owner-project-session"
    member_session = "member-project-session"
    with SessionLocal() as session:
        owner = Identity(username="owner", role="owner", status="active")
        member = Identity(username="member", role="member", status="active")
        session.add_all([owner, member])
        session.flush()
        member_id = member.id
        session.add_all([
            AuthSession(identity_id=owner.id, token_hash=hashlib.sha256(owner_session.encode()).hexdigest(), expires_at=now_utc() + timedelta(hours=1)),
            AuthSession(identity_id=member.id, token_hash=hashlib.sha256(member_session.encode()).hexdigest(), expires_at=now_utc() + timedelta(hours=1)),
        ])
        session.commit()

    fresh_database.cookies.set("runtrace_session", owner_session)
    first = fresh_database.post("/api/v1/projects", json={"name": "First", "slug": "first"}).json()
    second = fresh_database.post("/api/v1/projects", json={"name": "Second", "slug": "second"}).json()
    granted = fresh_database.post("/api/v1/auth/projects/first/members", json={"identity_id": member_id, "role": "viewer"})
    assert granted.status_code == 201
    assert granted.json()["role"] == "viewer"

    fresh_database.cookies.clear()
    fresh_database.cookies.set("runtrace_session", member_session)
    assert {project["id"] for project in fresh_database.get("/api/v1/projects").json()} == {first["id"]}
    assert fresh_database.get("/api/v1/projects/first").status_code == 200
    assert fresh_database.get("/api/v1/projects/second").status_code == 403
    assert fresh_database.post("/api/v1/projects/first/experiments", json={"title": "No", "hypothesis": "viewer"}).status_code == 403

    fresh_database.cookies.clear()
    fresh_database.cookies.set("runtrace_session", owner_session)
    assert fresh_database.patch(f"/api/v1/auth/projects/first/members/{member_id}", json={"role": "editor"}).status_code == 200

    fresh_database.cookies.clear()
    fresh_database.cookies.set("runtrace_session", member_session)
    assert fresh_database.post("/api/v1/projects/first/experiments", json={"title": "Allowed", "hypothesis": "editor"}).status_code == 201
    created = fresh_database.post("/api/v1/auth/tokens", json={"name": "First only", "project_ids": [first["id"]]})
    assert created.status_code == 201
    secret = created.json()["token"]
    token_id = created.json()["api_token"]["id"]
    assert [project["id"] for project in created.json()["api_token"]["projects"]] == [first["id"]]

    fresh_database.cookies.clear()
    headers = {"Authorization": f"Bearer {secret}"}
    assert fresh_database.get("/api/v1/projects/first", headers=headers).status_code == 200
    assert fresh_database.get("/api/v1/projects/second", headers=headers).status_code == 403

    fresh_database.cookies.set("runtrace_session", owner_session)
    all_tokens = fresh_database.get("/api/v1/auth/tokens").json()
    listed = next(token for token in all_tokens if token["id"] == token_id)
    assert listed["identity"]["username"] == "member"
    assert fresh_database.delete(f"/api/v1/auth/tokens/{token_id}").status_code == 204
    fresh_database.cookies.clear()
    assert fresh_database.get("/api/v1/projects/first", headers=headers).status_code == 401

    with SessionLocal() as session:
        assert session.scalar(select(ProjectMembership).where(ProjectMembership.project_id == second["id"], ProjectMembership.identity_id == member_id)) is None
