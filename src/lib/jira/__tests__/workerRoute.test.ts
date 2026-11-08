import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ process: vi.fn(), execute: vi.fn(), context: null as unknown }));
const context = new AsyncLocalStorage<boolean>();
mocks.context = context;
vi.mock("@/lib/jira/jobs", () => ({ processJiraJobs: mocks.process }));
vi.mock("@/lib/observability", () => ({ withApi: (handler: unknown) => handler }));
vi.mock("@/lib/jobs/executionHealth", () => ({ observeWorker: async (_name: string, work: (stage: () => void) => Promise<{ data: unknown }>) => (await work(() => {})).data }));
vi.mock("@/lib/db", () => ({
  withServiceContext: (fn: () => unknown) => (mocks.context as AsyncLocalStorage<boolean>).run(true, fn),
  db: { $executeRaw: () => ({
    // Prisma executes query extensions when its promise is consumed, not
    // when the tagged template is constructed.
    then(resolve: (value: number) => void, reject: (error: Error) => void) {
      if (!(mocks.context as AsyncLocalStorage<boolean>).getStore()) return reject(new Error("Missing database context"));
      mocks.execute();
      resolve(1);
    },
  }) },
}));

import { GET } from "@/app/api/internal/jira/jobs/run/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "test-worker-authorization");
  mocks.process.mockResolvedValue({ claimed: 0, completed: 0, retried: 0, failed: 0 });
});
afterEach(() => vi.unstubAllEnvs());

describe("scheduled Jira worker", () => {
  it("completes an empty cycle and consumes retention inside service context", async () => {
    const response = await GET(new Request("https://app.test/api/internal/jira/jobs/run", { headers: { authorization: "Bearer test-worker-authorization" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ claimed: 0, completed: 0, retried: 0, failed: 0 });
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(context.getStore()).toBeUndefined();
  });
  it("rejects an unauthorized call before claiming or retaining data", async () => {
    expect((await GET(new Request("https://app.test/api/internal/jira/jobs/run"))).status).toBe(401);
    expect(mocks.process).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
