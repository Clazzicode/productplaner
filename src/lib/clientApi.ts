// Tiny client-side fetch wrapper: JSON in/out, errors surfaced as strings.

export interface ApiResult<T = Record<string, unknown>> {
  ok: boolean;
  data?: T;
  error?: string;
}

export async function apiFetch<T = Record<string, unknown>>(
  url: string,
  options?: { method?: string; body?: unknown },
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: options?.method ?? "GET",
      headers: options?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const body = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) {
      return { ok: false, error: body.error ?? `Request failed (${res.status})`, data: body };
    }
    return { ok: true, data: body };
  } catch {
    return { ok: false, error: "Network error — is the dev server running?" };
  }
}

/** Same result shape as apiFetch, for multipart/form-data uploads — never
 * JSON.stringify a FormData body (this is why apiFetch itself can't be
 * reused for document upload). */
export async function uploadFile<T = Record<string, unknown>>(url: string, formData: FormData): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { method: "POST", body: formData });
    const body = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) {
      return { ok: false, error: body.error ?? `Request failed (${res.status})`, data: body };
    }
    return { ok: true, data: body };
  } catch {
    return { ok: false, error: "Network error — is the dev server running?" };
  }
}

export interface BackgroundJobResult<T = Record<string, unknown>> {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "dead_letter" | "cancelled";
  result: T | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

export async function waitForBackgroundJob<T = Record<string, unknown>>(
  jobId: string,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<ApiResult<BackgroundJobResult<T>>> {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const intervalMs = options.intervalMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await apiFetch<BackgroundJobResult<T>>(`/api/background-jobs/${jobId}`);
    if (!result.ok || !result.data) return result;
    if (result.data.status === "completed") return result;
    if (["failed", "dead_letter", "cancelled"].includes(result.data.status)) {
      return { ok: false, data: result.data, error: result.data.lastErrorMessage ?? "Background work failed." };
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return { ok: false, error: "This is taking longer than expected. The work is still queued and can continue safely." };
}
