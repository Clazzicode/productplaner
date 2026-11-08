import { describe, expect, it } from "vitest";
import { canPerformAction, COLLABORATION_ACTIONS } from "../actions";

const internal = { status: "active", memberType: "internal", permissionRole: "member" };
describe("collaboration action matrix", () => {
  it("allows internal editors planning changes and story acceptance, but no final approval", () => {
    for (const action of COLLABORATION_ACTIONS) {
      expect(canPerformAction(internal, "edit", action), action).toBe(["read", "edit", "submit_feedback", "triage_feedback", "accept_story"].includes(action));
    }
  });
  it("limits viewers and external administrators to read and feedback with actual access", () => {
    for (const actor of [internal, { ...internal, memberType: "external", permissionRole: "admin" }]) {
      for (const action of COLLABORATION_ACTIONS) expect(canPerformAction(actor, "view", action), action).toBe(["read", "submit_feedback"].includes(action));
    }
    for (const action of COLLABORATION_ACTIONS) expect(canPerformAction({ ...internal, memberType: "external", permissionRole: "owner" }, "owner", action)).toBe(["read", "submit_feedback"].includes(action));
  });
  it("allows only active internal workspace administrators final authority", () => {
    for (const permissionRole of ["owner", "admin"]) for (const action of COLLABORATION_ACTIONS) expect(canPerformAction({ ...internal, permissionRole }, "owner", action)).toBe(true);
    for (const action of COLLABORATION_ACTIONS) {
      expect(canPerformAction({ ...internal, permissionRole: "owner", status: "disabled" }, "owner", action)).toBe(false);
      expect(canPerformAction({ ...internal, permissionRole: "owner" }, "none", action)).toBe(false);
    }
  });
});
