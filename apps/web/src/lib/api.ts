import type { Dashboard, Experiment, ProgressData, Project, Run, SearchResult, TagDefinition } from "@/lib/types"

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body instanceof FormData
      ? init.headers
      : { "Content-Type": "application/json", ...init?.headers },
  })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = await response.json()
      message = body.detail ?? message
    } catch {}
    throw new ApiError(message, response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const runtrace = {
  projects: () => api<Project[]>("/api/v1/projects"),
  createProject: (body: { name: string; slug: string; description: string; repository_url?: string }) =>
    api<Project>("/api/v1/projects", { method: "POST", body: JSON.stringify(body) }),
  dashboard: (slug: string) => api<Dashboard>(`/api/v1/projects/${slug}/dashboard`),
  progress: (slug: string, metric = "", window = "all", includeTags: string[] = [], excludeTags: string[] = []) => {
    const params = new URLSearchParams({ window })
    if (metric) params.set("metric", metric)
    includeTags.forEach((tag) => params.append("include_tag", tag))
    excludeTags.forEach((tag) => params.append("exclude_tag", tag))
    return api<ProgressData>(`/api/v1/projects/${slug}/progress?${params}`)
  },
  createExperiment: (slug: string, body: Record<string, unknown>) =>
    api(`/api/v1/projects/${slug}/experiments`, { method: "POST", body: JSON.stringify(body) }),
  experiment: (slug: string, id: string) => api<Experiment>(`/api/v1/projects/${slug}/experiments/${id}`),
  updateExperiment: (slug: string, id: string, body: Record<string, unknown>) =>
    api<Experiment>(`/api/v1/projects/${slug}/experiments/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  archiveExperiment: (slug: string, id: string) => api(`/api/v1/projects/${slug}/experiments/${id}/archive`, { method: "POST" }),
  restoreExperiment: (slug: string, id: string) => api(`/api/v1/projects/${slug}/experiments/${id}/restore`, { method: "POST" }),
  deleteExperiment: (slug: string, id: string) => api(`/api/v1/projects/${slug}/experiments/${id}`, { method: "DELETE" }),
  archiveRun: (id: string) => api(`/api/v1/runs/${id}/archive`, { method: "POST" }),
  restoreRun: (id: string) => api(`/api/v1/runs/${id}/restore`, { method: "POST" }),
  deleteRun: (id: string) => api(`/api/v1/runs/${id}`, { method: "DELETE" }),
  setBaseline: (slug: string, id: string) => api(`/api/v1/projects/${slug}/baseline`, { method: "POST", body: JSON.stringify({ run_id: id }) }),
  run: (id: string) => api<Run>(`/api/v1/runs/${id}`),
  search: (slug: string, query: string, includeArchived = false, includeTags: string[] = [], excludeTags: string[] = []) => {
    const params = new URLSearchParams({ q: query, include_archived: String(includeArchived), limit: "50" })
    includeTags.forEach((tag) => params.append("include_tag", tag))
    excludeTags.forEach((tag) => params.append("exclude_tag", tag))
    return api<{ results: SearchResult[]; count: number }>(`/api/v1/projects/${slug}/search?${params}`)
  },
  uploadArtifact: (id: string, file: File, kind: string) => {
    const body = new FormData()
    body.set("file", file)
    body.set("metadata", JSON.stringify({ kind }))
    return api(`/api/v1/runs/${id}/artifacts`, { method: "POST", body })
  },
  previewArtifact: (id: string) => api<{ id: string; name: string; content_type: string; content: string; truncated: boolean }>(`/api/v1/artifacts/${id}/preview`),
  updateProject: (slug: string, description: string, repositoryUrl?: string) => api(`/api/v1/projects/${slug}`, {
    method: "PATCH",
    body: JSON.stringify({ description, ...(repositoryUrl !== undefined ? { repository_url: repositoryUrl.trim() || null } : {}) }),
  }),
  updateProgram: (slug: string, content: string) => api(`/api/v1/projects/${slug}/program`, { method: "PUT", body: JSON.stringify({ content }) }),
  updateExclusions: (slug: string, rules: string[]) => api(`/api/v1/projects/${slug}/exclusions`, { method: "PUT", body: JSON.stringify({ rules }) }),
  updateSettings: (slug: string, metric_name: string, direction: string) => api(`/api/v1/projects/${slug}/settings`, { method: "PUT", body: JSON.stringify({ metric_name, direction }) }),
  tags: (slug: string) => api<TagDefinition[]>(`/api/v1/projects/${slug}/tags`),
  createTag: (slug: string, name: string) => api<TagDefinition>(`/api/v1/projects/${slug}/tags`, { method: "POST", body: JSON.stringify({ name }) }),
  updateTag: (slug: string, id: string, name: string) => api<TagDefinition>(`/api/v1/projects/${slug}/tags/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deleteTag: (slug: string, id: string) => api<void>(`/api/v1/projects/${slug}/tags/${id}`, { method: "DELETE" }),
}
