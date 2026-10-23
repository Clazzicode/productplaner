const BASE_RESPONSE_HEADERS = {
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

/**
 * A nonce-based policy keeps Next.js/React's required inline bootstrap code
 * working without granting every inline script permission to execute.
 */
export function buildContentSecurityPolicy(nonce: string, development = process.env.NODE_ENV === "development"): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co${development ? " ws: http:" : ""}`,
    "media-src 'self' blob: data:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!development) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function applySecurityResponseHeaders(response: Response, contentSecurityPolicy: string): void {
  response.headers.set("content-security-policy", contentSecurityPolicy);
  for (const [name, value] of Object.entries(BASE_RESPONSE_HEADERS)) response.headers.set(name, value);
  if (process.env.NODE_ENV === "production") {
    response.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
}

