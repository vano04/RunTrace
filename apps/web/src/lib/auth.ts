import { api } from "@/lib/api"

export type IdentityRole = "owner" | "admin" | "member"
export type IdentityStatus = "active" | "pending" | "suspended"

export interface AuthIdentity {
  id: string
  name: string
  role: IdentityRole
  status: IdentityStatus
  last_active_at?: string | null
  created_at?: string
  passkeys?: Passkey[]
}

export interface Passkey {
  id: string
  name: string
  device_type: string
  backed_up: boolean
  transports: string[]
  last_used_at: string | null
  created_at: string
}

export interface AuthStatus {
  dev: boolean
  configured: boolean
  authenticated: boolean
  identity: AuthIdentity | null
}

interface CeremonyOptions {
  ceremony_id: string
  options: Record<string, unknown>
}

function decode(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer
}

function encode(value: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(value))
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function creationOptions(options: Record<string, unknown>): PublicKeyCredentialCreationOptions {
  const user = options.user as Record<string, unknown>
  const excludeCredentials = (options.excludeCredentials as Array<Record<string, unknown>> | undefined) ?? []
  return {
    ...(options as unknown as PublicKeyCredentialCreationOptions),
    challenge: decode(options.challenge as string),
    user: { ...(user as unknown as PublicKeyCredentialUserEntity), id: decode(user.id as string) },
    excludeCredentials: excludeCredentials.map((item) => ({
      ...(item as unknown as PublicKeyCredentialDescriptor),
      id: decode(item.id as string),
    })),
  }
}

function requestOptions(options: Record<string, unknown>): PublicKeyCredentialRequestOptions {
  const allowCredentials = (options.allowCredentials as Array<Record<string, unknown>> | undefined) ?? []
  return {
    ...(options as unknown as PublicKeyCredentialRequestOptions),
    challenge: decode(options.challenge as string),
    allowCredentials: allowCredentials.map((item) => ({
      ...(item as unknown as PublicKeyCredentialDescriptor),
      id: decode(item.id as string),
    })),
  }
}

function registrationCredential(credential: PublicKeyCredential): Record<string, unknown> {
  const response = credential.response as AuthenticatorAttestationResponse
  return {
    id: credential.id,
    rawId: encode(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      attestationObject: encode(response.attestationObject),
      clientDataJSON: encode(response.clientDataJSON),
      transports: response.getTransports?.() ?? [],
    },
  }
}

function authenticationCredential(credential: PublicKeyCredential): Record<string, unknown> {
  const response = credential.response as AuthenticatorAssertionResponse
  return {
    id: credential.id,
    rawId: encode(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      authenticatorData: encode(response.authenticatorData),
      clientDataJSON: encode(response.clientDataJSON),
      signature: encode(response.signature),
      userHandle: response.userHandle ? encode(response.userHandle) : null,
    },
  }
}

function requirePasskeys() {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    throw new Error("This browser does not support passkeys. Use a current browser or a security key.")
  }
}

async function register(optionsPath: string, verifyPath: string, body?: Record<string, unknown>) {
  requirePasskeys()
  const ceremony = await api<CeremonyOptions>(optionsPath, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  })
  const credential = await navigator.credentials.create({ publicKey: creationOptions(ceremony.options) })
  if (!(credential instanceof PublicKeyCredential)) throw new Error("Passkey creation was cancelled")
  return api<{ identity: AuthIdentity }>(verifyPath, {
    method: "POST",
    body: JSON.stringify({ ceremony_id: ceremony.ceremony_id, credential: registrationCredential(credential) }),
  })
}

export const auth = {
  status: () => api<AuthStatus>("/api/v1/auth/status", { cache: "no-store" }),
  bootstrap: (name: string) => register("/api/v1/auth/bootstrap/options", "/api/v1/auth/registration/verify", { name }),
  setup: (token: string) => register("/api/v1/auth/setup/options", "/api/v1/auth/setup/verify", { token }),
  addPasskey: () => register("/api/v1/auth/passkeys/options", "/api/v1/auth/passkeys/verify"),
  async login() {
    requirePasskeys()
    const ceremony = await api<CeremonyOptions>("/api/v1/auth/login/options", { method: "POST" })
    const credential = await navigator.credentials.get({ publicKey: requestOptions(ceremony.options) })
    if (!(credential instanceof PublicKeyCredential)) throw new Error("Passkey sign-in was cancelled")
    return api<{ identity: AuthIdentity }>("/api/v1/auth/login/verify", {
      method: "POST",
      body: JSON.stringify({ ceremony_id: ceremony.ceremony_id, credential: authenticationCredential(credential) }),
    })
  },
  logout: () => api<void>("/api/v1/auth/logout", { method: "POST" }),
  identities: () => api<AuthIdentity[]>("/api/v1/auth/identities", { cache: "no-store" }),
  createIdentity: (body: { name: string; role: "admin" | "member" }) => api<{ identity: AuthIdentity; setup_token: string; setup_path: string }>("/api/v1/auth/identities", { method: "POST", body: JSON.stringify(body) }),
  updateIdentity: (id: string, body: { role?: "admin" | "member"; status?: "active" | "suspended" }) => api<AuthIdentity>(`/api/v1/auth/identities/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  setupLink: (id: string) => api<{ setup_token: string; setup_path: string }>(`/api/v1/auth/identities/${id}/setup-link`, { method: "POST" }),
  revokePasskey: (identityId: string, passkeyId: string) => api<void>(`/api/v1/auth/identities/${identityId}/passkeys/${passkeyId}`, { method: "DELETE" }),
}
