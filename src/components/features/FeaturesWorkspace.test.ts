import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import FeaturesWorkspace from "./FeaturesWorkspace";

const route = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(route.query),
  useRouter: () => ({ refresh: () => {} }),
}));

const products = [{ id: "guided", name: "Guided Planning" }, { id: "new", name: "new — Project" }];

describe("combined features page", () => {
  it("shows the list by default and opens the product picker from the shared creation URL", () => {
    route.query = "";
    const browse = renderToStaticMarkup(createElement(FeaturesWorkspace, { features: [], products, canCreate: true }));
    expect(browse).not.toContain("Choose the product where this feature will live.");
    expect(browse).toContain("Filter features");

    route.query = "create=feature";
    const creating = renderToStaticMarkup(createElement(FeaturesWorkspace, { features: [], products, canCreate: true }));
    expect(creating).toContain("Choose the product where this feature will live.");
    expect(creating).toContain("Select a product to continue.");
    expect(creating).toContain("disabled");

    route.query = "create=feature&productId=guided";
    const preselected = renderToStaticMarkup(createElement(FeaturesWorkspace, { features: [], products, canCreate: true }));
    expect(preselected).toContain("Creating in <strong");
    expect(preselected).toContain("/projects/guided/initiatives/new");
  });

  it("does not open creation for a viewer without permission", () => {
    route.query = "create=feature";
    const html = renderToStaticMarkup(createElement(FeaturesWorkspace, { features: [], products, canCreate: false }));
    expect(html).not.toContain("Choose the product where this feature will live.");
  });
});
