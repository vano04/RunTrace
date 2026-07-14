import { api } from "@/lib/api"

export type IdentityRole = "owner" | "admin" | "member"
export type IdentityStatus = "active" | "pending" | "suspended"

export interface AuthIdentity {
  id: string
  username: string
  role: IdentityRole
  status: IdentityStatus
  password_set?: boolean
  last_active_at?: string | null
  created_at?: string
}

export interface ApiToken {
  id: string
  name: string
  prefix: string
  last_used_at: string | null
  expires_at: string | null
  created_at: string
  identity?: Pick<AuthIdentity, "id" | "username">
  projects: Array<{ id: string; slug: string; name: string }>
}

export interface AuthStatus {
  dev: boolean
  configured: boolean
  authenticated: boolean
  identity: AuthIdentity | null
}

export type ProjectRole = "owner" | "editor" | "viewer"
export interface ProjectMember {
  identity: AuthIdentity
  role: ProjectRole
  created_at: string
  updated_at: string
}

export const auth = {
  status: () => api<AuthStatus>("/api/v1/auth/status", { cache: "no-store" }),
  bootstrap: (username: string, password: string) => api<{ identity: AuthIdentity }>("/api/v1/auth/bootstrap", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  }),
  setup: (token: string, password: string) => api<{ identity: AuthIdentity }>("/api/v1/auth/setup", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  }),
  login: (username: string, password: string) => api<{ identity: AuthIdentity }>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  }),
  changePassword: (currentPassword: string, newPassword: string) => api<{ identity: AuthIdentity }>("/api/v1/auth/password", {
    method: "POST",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  }),
  logout: () => api<void>("/api/v1/auth/logout", { method: "POST" }),
  identities: () => api<AuthIdentity[]>("/api/v1/auth/identities", { cache: "no-store" }),
  createIdentity: (body: { username: string; role: "admin" | "member" }) => api<{ identity: AuthIdentity; setup_token: string; setup_path: string }>("/api/v1/auth/identities", { method: "POST", body: JSON.stringify(body) }),
  updateIdentity: (id: string, body: { role?: "admin" | "member"; status?: "active" | "suspended" }) => api<AuthIdentity>(`/api/v1/auth/identities/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  setupLink: (id: string) => api<{ setup_token: string; setup_path: string }>(`/api/v1/auth/identities/${id}/setup-link`, { method: "POST" }),
  tokens: () => api<ApiToken[]>("/api/v1/auth/tokens", { cache: "no-store" }),
  createToken: (body: { name: string; expires_in_days: number | null; project_ids: string[] }) => api<{ token: string; api_token: ApiToken }>("/api/v1/auth/tokens", { method: "POST", body: JSON.stringify(body) }),
  revokeToken: (id: string) => api<void>(`/api/v1/auth/tokens/${id}`, { method: "DELETE" }),
  projectMembers: (project: string) => api<ProjectMember[]>(`/api/v1/auth/projects/${project}/members`, { cache: "no-store" }),
  addProjectMember: (project: string, body: { username: string; role: ProjectRole }) => api<ProjectMember>(`/api/v1/auth/projects/${project}/members`, { method: "POST", body: JSON.stringify(body) }),
  updateProjectMember: (project: string, identityId: string, role: ProjectRole) => api<ProjectMember>(`/api/v1/auth/projects/${project}/members/${identityId}`, { method: "PATCH", body: JSON.stringify({ role }) }),
  removeProjectMember: (project: string, identityId: string) => api<void>(`/api/v1/auth/projects/${project}/members/${identityId}`, { method: "DELETE" }),
}
