export function demoIntegrationsEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.ENABLE_DEMO_INTEGRATIONS === "true";
}

export function assertDemoIntegrationsEnabled(): void {
  if (!demoIntegrationsEnabled()) throw new Error("Demo integrations are disabled. Live synchronization is not implemented.");
}
