import { appendFileSync } from "node:fs";

const source = process.env.DATABASE_URL;
const password = process.env.STAGING_APP_RW_PASSWORD;
const environmentFile = process.env.GITHUB_ENV;

if (!source || !password || !/^[A-Za-z0-9_-]{32,}$/.test(password) || !environmentFile) {
  console.error("Staging database setup is missing a valid connection, role password, or GitHub environment file.");
  process.exit(1);
}

let url;
try {
  url = new URL(source);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username) {
    throw new Error("invalid connection");
  }
} catch {
  console.error("Staging DATABASE_URL is not a valid Postgres connection string.");
  process.exit(1);
}

// Use one protected password secret for both the runtime URL and role setup.
// The corrected connection string is written only to the runner's temporary
// environment file; neither the original nor corrected value is logged.
url.password = password;
appendFileSync(environmentFile, `DATABASE_URL=${url.toString()}\n`, { mode: 0o600 });
console.log("Prepared the staging application connection from protected secrets.");
