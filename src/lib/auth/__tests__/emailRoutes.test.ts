import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  signUp: vi.fn(), signIn: vi.fn(), resetEmail: vi.fn(), updateUser: vi.fn(), getUser: vi.fn(),
  exchange: vi.fn(), signOut: vi.fn(), provision: vi.fn(), clear: vi.fn(), rate: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: {
  signUp: mocks.signUp, signInWithPassword: mocks.signIn, resetPasswordForEmail: mocks.resetEmail,
  updateUser: mocks.updateUser, getUser: mocks.getUser, exchangeCodeForSession: mocks.exchange, signOut: mocks.signOut,
} }) }));
vi.mock("@/lib/auth/provision", () => ({ ensureAuthenticatedWorkspace: mocks.provision }));
vi.mock("@/lib/auth/session", () => ({ clearActiveOrganizationCookie: mocks.clear }));
vi.mock("@/lib/onboarding/tempStateServer", () => ({ clearOnboardingStateServer: mocks.clear }));
vi.mock("@/lib/rateLimit", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/rateLimit")>(), checkRateLimit: mocks.rate,
}));
import { POST as signUp } from "@/app/api/auth/sign-up/route";
import { POST as signIn } from "@/app/api/auth/sign-in/route";
import { POST as forgot } from "@/app/api/auth/forgot-password/route";
import { POST as reset } from "@/app/api/auth/reset-password/route";
import { GET as callback } from "@/app/auth/callback/route";
const user = { id: "verified-auth-id", email: "customer@example.com", email_confirmed_at: "2026-09-25T00:00:00Z" };
const request = (path: string, body: unknown, origin = "https://planning.example") => new Request(`https://planning.example${path}`, {
  method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("APP_ENVIRONMENT", "development");
  vi.stubEnv("VERCEL_TARGET_ENV", "development");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.rate.mockResolvedValue({ allowed: true, remaining: 4, retryAfterSeconds: 60 });
  mocks.signUp.mockResolvedValue({ data: { user, session: null }, error: null });
  mocks.signIn.mockResolvedValue({ data: { user }, error: null });
  mocks.resetEmail.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({ data: { user }, error: null });
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("customer email authentication", () => {
  it("uses public sign-up and does not provision an unconfirmed account", async () => {
    const response = await signUp(request("/api/auth/sign-up", { email: " Customer@Example.com ", name: "Avery", password: "strong-password" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ confirmationRequired: true });
    expect(mocks.signUp).toHaveBeenCalledWith({ email: "customer@example.com", password: "strong-password", options: { data: { name: "Avery" }, emailRedirectTo: "https://planning.example/auth/callback" } });
    expect(mocks.provision).not.toHaveBeenCalled();
  });
  it.each([{ username: "old-user" }, { email: "new-user@local.invalid" }])("rejects new placeholder accounts: %j", async (identity) => {
    expect((await signUp(request("/api/auth/sign-up", { ...identity, name: "Name", password: "password123" }))).status).toBe(422);
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
  it("does not reveal a duplicate email", async () => {
    const input = { email: user.email, name: "Name", password: "password123" };
    const first = await (await signUp(request("/api/auth/sign-up", input))).json();
    mocks.signUp.mockResolvedValue({ data: {}, error: { code: "user_already_exists", status: 422 } });
    expect(await (await signUp(request("/api/auth/sign-up", input))).json()).toEqual(first);
  });
  it("signs in with email and provisions only the provider-verified identity", async () => {
    const response = await signIn(request("/api/auth/sign-in", { email: user.email, password: "password123", userId: "forged" }));
    expect(response.status).toBe(200);
    expect(mocks.provision).toHaveBeenCalledWith(user);
    expect(mocks.signIn).toHaveBeenCalledWith({ email: user.email, password: "password123" });
  });
  it("retains sign-in for existing username accounts", async () => {
    expect((await signIn(request("/api/auth/sign-in", { username: "old-user", password: "password123" }))).status).toBe(200);
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "old-user@local.invalid", password: "password123" });
  });
  it("rejects an unconfirmed session without creating a workspace", async () => {
    mocks.signIn.mockResolvedValue({ data: { user: { ...user, email_confirmed_at: null } }, error: null });
    expect((await signIn(request("/api/auth/sign-in", { email: user.email, password: "password123" }))).status).toBe(401);
    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.provision).not.toHaveBeenCalled();
  });
  it("rejects cross-origin account creation before any provider call", async () => {
    expect((await signUp(request("/api/auth/sign-up", {}, "https://attacker.example"))).status).toBe(403);
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
});

describe("email callbacks and recovery", () => {
  it("rejects an expired or invalid callback without provisioning", async () => {
    mocks.exchange.mockResolvedValue({ data: {}, error: { message: "Invalid code" } });
    const response = await callback(new Request("https://planning.example/auth/callback?code=expired"));
    expect(response.headers.get("location")).toBe("https://planning.example/login?authError=link");
    expect(mocks.provision).not.toHaveBeenCalled();
  });
  it("exchanges PKCE code and ignores malicious redirects", async () => {
    mocks.exchange.mockResolvedValue({ data: { user }, error: null });
    const response = await callback(new Request("https://planning.example/auth/callback?code=valid&next=https://evil.example"));
    expect(mocks.exchange).toHaveBeenCalledWith("valid");
    expect(mocks.provision).toHaveBeenCalledWith(user);
    expect(response.headers.get("location")).toBe("https://planning.example/");
  });
  it("sends recovery to the password form without creating a workspace", async () => {
    mocks.exchange.mockResolvedValue({ data: { user }, error: null });
    const response = await callback(new Request("https://planning.example/auth/callback?code=valid&next=/reset-password"));
    expect(response.headers.get("location")).toBe("https://planning.example/reset-password");
    expect(mocks.provision).not.toHaveBeenCalled();
  });
  it("returns the same recovery result for absent or throttled accounts", async () => {
    const first = await (await forgot(request("/api/auth/forgot-password", { email: user.email }))).json();
    mocks.resetEmail.mockResolvedValue({ error: { status: 429, code: "over_email_send_rate_limit" } });
    expect(await (await forgot(request("/api/auth/forgot-password", { email: user.email }))).json()).toEqual(first);
    expect(mocks.resetEmail).toHaveBeenCalledWith(user.email, { redirectTo: "https://planning.example/auth/callback?next=%2Freset-password" });
  });
  it.each([forgot, reset])("enforces application throttling on recovery endpoints", async (handler) => {
    mocks.rate.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    const path = handler === forgot ? "forgot-password" : "reset-password";
    expect((await handler(request(`/api/auth/${path}`, { email: user.email, password: "password123" }))).status).toBe(429);
    expect(mocks.resetEmail).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("rejects password changes without a verified session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await reset(request("/api/auth/reset-password", { password: "password123" }))).status).toBe(401);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("changes password and signs out the verified user", async () => {
    expect((await reset(request("/api/auth/reset-password", { password: "password123" }))).status).toBe(200);
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "password123" });
    expect(mocks.signOut).toHaveBeenCalled();
  });
});
