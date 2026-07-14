# Instance authentication

RunTrace normal mode is passwordless and instance-scoped. An identity consists of a display name, a role, and one or more passkeys. It does not have an email address, username, phone number, or password.

## First-run contract

When the `identities` table is empty, data API requests return `428` and the web app shows owner onboarding. Completing WebAuthn registration atomically creates the sole `owner`, stores the credential public key and metadata, and starts an opaque server-side session. A concurrent second bootstrap attempt is rejected.

After the owner exists, unauthenticated data API requests return `401`. The health endpoint and the endpoints needed to begin or finish a WebAuthn ceremony remain public.

## Roles and access

- `owner` has full access and cannot be demoted, suspended, or left without a passkey.
- `admin` can use the app and manage identities, roles, setup links, suspension, and passkey revocation.
- `member` can use the app but cannot manage instance access.

Admins create a name-only identity and receive a random one-time setup link. The token is stored only as a SHA-256 digest, expires after 24 hours by default, and is invalidated after enrollment. Creating a replacement link invalidates the previous one.

Suspending an identity or revoking one of its passkeys deletes all of that identity's sessions. A passkey may belong to only one identity. Private key material never leaves the authenticator and is never sent to RunTrace.

## Sessions and deployment

Successful passkey verification creates a random opaque session token. Only its SHA-256 digest is persisted. The browser receives the token in an `HttpOnly`, `SameSite=Lax` cookie; it is also marked `Secure` whenever every configured WebAuthn origin uses HTTPS. Sessions expire after seven days by default.

Configure these values before enrolling passkeys:

```env
RUNTRACE_DEV=false
RUNTRACE_WEBAUTHN_RP_ID=runtrace.example.com
RUNTRACE_WEBAUTHN_RP_NAME=RunTrace
RUNTRACE_WEBAUTHN_ORIGINS=https://runtrace.example.com
RUNTRACE_SESSION_TTL_HOURS=168
RUNTRACE_SETUP_LINK_TTL_HOURS=24
```

Changing the RP ID or public origin makes existing passkeys unusable. Production deployments should use HTTPS and a stable hostname.

## Development split

`RUNTRACE_DEV=true` is intentionally unauthenticated. It synthesizes owner access for every request and keeps the seeded preview and existing test workflows free of onboarding. Do not expose this mode outside a trusted development machine.
