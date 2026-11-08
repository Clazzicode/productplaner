import { afterEach, describe, expect, it, vi } from "vitest";
import { historySnapshot, subscribeHistory } from "./navigationHistory";

afterEach(() => vi.unstubAllGlobals());

describe("in-app history controls", () => {
  it("tracks push, replace, traversal, and a new branch without using outside history", () => {
    const events = new EventTarget();
    const entries: unknown[] = [{ external: true }];
    let cursor = 0;
    const history = {
      get state() { return entries[cursor]; },
      pushState(data: unknown) { entries.splice(cursor + 1); entries.push(data); cursor++; },
      replaceState(data: unknown) { entries[cursor] = data; },
    };
    vi.stubGlobal("window", { history, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) });
    const stop = subscribeHistory(() => {});
    try {
      expect(historySnapshot()).toEqual({ back: false, forward: false });
      history.pushState({ next: "projects" });
      history.pushState({ next: "new" });
      cursor--; events.dispatchEvent(new Event("popstate"));
      expect(historySnapshot()).toEqual({ back: true, forward: true });
      history.replaceState({ next: "edited query" });
      expect(historySnapshot()).toEqual({ back: true, forward: true });
      history.pushState({ next: "teams" });
      expect(historySnapshot()).toEqual({ back: true, forward: false });
      cursor = 0; events.dispatchEvent(new Event("popstate"));
      expect(historySnapshot()).toEqual({ back: false, forward: true });
      expect(history.state).toMatchObject({ external: true });
    } finally { stop(); }
  });
});
