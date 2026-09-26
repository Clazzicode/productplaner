const PRODUCTION_SUPABASE_PROJECT_REF = "hzsrdpbdbfqaicropsha";

export interface EnvironmentIsolation {
  deploymentEnvironment: string;
  databaseProjectRef: string | null;
  isolated: boolean;
  reason: string | null;
}
function projectRef(value: string | undefined, database = false): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!database) {
      return url.protocol === "https:" ? /^([a-z0-9-]+)\.supabase\.co$/.exec(url.hostname)?.[1] ?? null : null;
    }
    if (!["postgres:", "postgresql:"].includes(url.protocol)) return null;
    const direct = /^db\.([a-z0-9-]+)\.supabase\.co$/.exec(url.hostname)?.[1];
    if (direct) return direct;
    if (url.hostname.endsWith(".pooler.supabase.com")) {
      return /^[^.]+\.([a-z0-9-]+)$/.exec(decodeURIComponent(url.username))?.[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fail closed for hosted previews/staging before contacting Auth or Postgres.
 * Local development and production keep their existing configuration behavior.
 * DIRECT_URL is checked when present because migration jobs also consume it.
 */
export function environmentIsolation(): EnvironmentIsolation {
  const deploymentEnvironment = process.env.VERCEL_ENV ?? process.env.APP_ENVIRONMENT ?? "development";
  const databaseProjectRef = projectRef(process.env.DATABASE_URL, true);
  const requiresIsolation = deploymentEnvironment === "preview"
    || ["staging", "preview", "test"].includes(process.env.APP_ENVIRONMENT ?? "")
    || (process.env.VERCEL_TARGET_ENV !== undefined && !["production", "development"].includes(process.env.VERCEL_TARGET_ENV));
  let reason: string | null = null;
  if (requiresIsolation) {
    const refs = [projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL), databaseProjectRef];
    if (process.env.DIRECT_URL) refs.push(projectRef(process.env.DIRECT_URL, true));
    const productionRefs = [PRODUCTION_SUPABASE_PROJECT_REF, process.env.PRODUCTION_SUPABASE_PROJECT_REF];
    if (refs.some((ref) => ref !== null && productionRefs.includes(ref))) {
      reason = "Non-production deployment is connected to the production Supabase project.";
    } else if (refs.some((ref) => ref === null)) {
      reason = "Non-production Supabase connection could not be verified.";
    } else if (new Set(refs).size !== 1) {
      reason = "Non-production Auth and database connections target different Supabase projects.";
    }
  }
  return { deploymentEnvironment, databaseProjectRef, isolated: reason === null, reason };
}

export class EnvironmentIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvironmentIsolationError";
  }
}

export function assertEnvironmentIsolation(): void {
  const status = environmentIsolation();
  if (!status.isolated) throw new EnvironmentIsolationError(status.reason!);
}
