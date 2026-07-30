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
