import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfigFromFile } from "@prisma/config";

describe("patched Prisma config dependency", () => {
  it("loads schema and migration configuration through Prisma's real config loader", async () => {
    const root = await mkdtemp(join(tmpdir(), "planning-prisma-config-"));
    try {
      await writeFile(join(root, "prisma.config.mjs"), 'export default { schema: "prisma/schema.prisma", migrations: { path: "prisma/migrations", seed: "node seed.mjs" } };');
      const result = await loadConfigFromFile({ configRoot: root });
      expect(result.error).toBeUndefined();
      expect(result.config?.schema).toBe(join(root, "prisma/schema.prisma"));
      expect(result.config?.migrations?.seed).toBe("node seed.mjs");
    } finally {
      // mkdtemp returns a newly created task-owned directory under the OS temp directory.
      await rm(root, { recursive: true, force: true });
    }
  });
});
