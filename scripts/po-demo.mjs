import { spawn } from "node:child_process";
// A local development preview, never a production authentication fallback.
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3012"], {
  stdio: "inherit", env: { ...process.env, NODE_ENV: "development", PO_DEMO_ENABLED: "true",
    // Non-credentials let the public demo render without a configured account.
    // Protected routes still require a verified Supabase session.
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://clarivia-demo.invalid",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "local-demo-no-auth",
  },
});
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 0; });
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
