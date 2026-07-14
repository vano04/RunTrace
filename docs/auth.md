# Instance authentication

RunTrace normal mode uses instance-scoped identities with a display name,
password, role, and status. It does not require an email address or external
identity provider.

## First-run contract

When the identities table is empty, data API requests return `428` and the web
app shows owner onboarding. The first completed setup atomically creates the
sole owner, stores a salted scrypt password hash, and starts an opaque
server-side session. RunTrace never stores plaintext passwords.

Passwords must contain at least 12 characters. Use a password manager to
generate and store a unique password.

When upgrading an instance that already has a passkey-era owner, an existing
browser session can set a password from the account menu. If no session remains,
or the owner password is lost, set `RUNTRACE_OWNER_RECOVERY_PASSWORD` to a
temporary password of at least 12 characters for one startup, sign in, and then
remove the variable. Applying a recovery password revokes the owner's browser
sessions.

## Roles and access

- `owner` has full access and cannot be demoted or suspended.
- `admin` can use the app and manage identities, roles, setup links, and suspension.
- `member` can use projects and runs but cannot manage instance access.

Admins create a name-only identity and receive a random one-time setup link.
The recipient uses it to choose a password. The token is stored only as a
SHA-256 digest, expires after 24 hours by default, and is invalidated after
setup. Creating a replacement link invalidates the previous one. Suspending an
identity deletes its sessions and API tokens.

## Sessions and transport security

Successful password verification creates a random opaque session token. Only
its SHA-256 digest is persisted. The browser receives an `HttpOnly`,
`SameSite=Lax` cookie, and sessions expire after seven days by default.

For a trusted LAN deployment over plain HTTP, use:

```env
RUNTRACE_SECURE_SESSION_COOKIE=false
```

Plain HTTP does not protect passwords or session cookies from interception by
other devices on the network. Use HTTPS for untrusted networks and set:

```env
RUNTRACE_SECURE_SESSION_COOKIE=true
```

Normal mode authenticates browser requests with the session cookie and
headless clients with bearer tokens. Any signed-in identity can create tokens
under **Access → Your agent tokens**. A token is displayed only once; RunTrace
stores its SHA-256 digest, visible prefix, name, timestamps, and optional
expiry. Revocation is immediate.

## Development mode

`RUNTRACE_DEV=true` is intentionally unauthenticated. It synthesizes owner
access for every request. Do not expose this mode outside a trusted development
machine.
