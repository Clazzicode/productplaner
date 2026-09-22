const PRODUCTION_SUPABASE_PROJECT_REF = "hzsrdpbdbfqaicropsha";

export interface EnvironmentIsolation {
  deploymentEnvironment: string;
  databaseProjectRef: string | null;
  isolated: boolean;
  reason: string | null;
}
function projectRefFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".supabase.co") ? host.slice(0, -".supabase.co".length) : null;
  } catch {
    return null;
  }
}

/**
 * Detects the highest-risk environment mistake: a Vercel preview deployment
 * connected to the production Supabase project. Enforcement can be activated
 * once a staging branch is provisioned and Preview variables are updated.
 */
export function environmentIsolation(): EnvironmentIsolation {
  const deploymentEnvironment = process.env.VERCEL_ENV ?? process.env.APP_ENVIRONMENT ?? "development";
  const databaseProjectRef = projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const previewUsesProduction = deploymentEnvironment === "preview" && databaseProjectRef === PRODUCTION_SUPABASE_PROJECT_REF;
  return {
    deploymentEnvironment,
    databaseProjectRef,
    isolated: !previewUsesProduction,
    reason: previewUsesProduction ? "Preview deployment is connected to the production database." : null,
  };
}

export function assertEnvironmentIsolation(): void {
  const status = environmentIsolation();
  if (process.env.ENFORCE_ENVIRONMENT_ISOLATION === "true" && !status.isolated) {
    throw new Error(status.reason ?? "Deployment environment is not isolated.");
  }
}
