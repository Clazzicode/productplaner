import { describe, expect, it } from "vitest";
import { entryPointFingerprint, inspectEntryPoints, validateEntryPointInventory } from "../entryPointInventory";
describe("entry-point classification enforcement", () => {
  it("rejects a new unclassified protected entry point", () => {
    expect(validateEntryPointInventory({ "src/app/api/new/route.ts": "export const GET = withApi(handler);" }, [])).toContain("src/app/api/new/route.ts: unclassified entry point");
  });
  it("does not accept an imported but unused authenticated wrapper", () => {
    expect(validateEntryPointInventory({ route: "import { withAuthenticatedApi } from 'auth'; export const GET = withApi(handler);" }, [{ path: "route", classification: "authenticated-api", reason: "Authenticated user data route requiring verified context." }]).join("\n")).toContain("GET must use withAuthenticatedApi");
  });
  it("requires renewed review when an exception changes", () => {
    expect(validateEntryPointInventory({ route: "changed" }, [{ path: "route", classification: "diagnostic", reason: "Process liveness with no data access or mutation.", sourceFingerprint: entryPointFingerprint("previous") }]).join("\n")).toContain("exception changed");
  });
  it("covers every current route, page, layout and server-action file", () => {
    expect(inspectEntryPoints(process.cwd())).toEqual([]);
  });
});
