import { inspectEntryPoints } from "../src/lib/auth/entryPointInventory";
const issues = inspectEntryPoints(process.cwd());
if (issues.length) {
  console.error(issues.join("\n"));
  process.exitCode = 1;
} else console.log("Authenticated entry-point inventory passed.");
