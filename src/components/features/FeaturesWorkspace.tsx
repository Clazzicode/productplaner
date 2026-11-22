"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import StatusBadge from "@/components/roadmapStatus/StatusBadge";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import type { ResolvedStatus } from "@/lib/roadmapStatus/types";

type Product = { id: string; name: string };
type Feature = {
  id: string;
  name: string;
  description: string | null;
  product: Product | null;
  status: ResolvedStatus;
  stage: string | null;
  lifecycle: string;
  baselineApproved: boolean;
  jiraConnected: boolean;
  jiraSynced: boolean;
};

const STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: "Draft", variant: "neutral" },
  intake_in_progress: { label: "Intake in progress", variant: "amber" },
  generated: { label: "Prototype live", variant: "emerald" },
};

function NewFeaturePanel({ products, initialProductId, onClose }: {
  products: Product[];
  initialProductId: string;
  onClose: () => void;
}) {
  const [productId, setProductId] = useState(initialProductId);
  const selected = products.find(product => product.id === productId);

  return <aside aria-labelledby="new-feature-title" className="order-first rounded-2xl border border-[#dfe3f4] bg-white p-5 shadow-[0_8px_28px_rgba(46,71,125,0.06)] sm:p-6 lg:order-last">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 id="new-feature-title" className="text-2xl font-bold text-[#0d1b3e]">New feature</h2>
        <p className="mt-2 text-sm text-[#44557a]">Choose the product where this feature will live.</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Close new feature panel" className="rounded-md px-2 py-1 text-xl text-[#667089] hover:bg-[#f4f5fe]">×</button>
    </div>
    {products.length ? <>
      <label htmlFor="new-feature-product" className="mt-6 block text-sm font-semibold text-[#0d1b3e]">Product</label>
      <select id="new-feature-product" value={productId} onChange={event => setProductId(event.target.value)} className="mt-2 w-full rounded-lg border border-[#b6bde0] bg-white px-3 py-2.5 text-sm text-[#0d1b3e] focus:border-[#5145ed] focus:outline-2 focus:outline-[#5145ed]">
        <option value="">Choose a product…</option>
        {products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
      </select>
      <p className="mt-6 rounded-lg bg-[#f0efff] px-4 py-3 text-sm text-[#44557a]">
        {selected ? <>Creating in <strong className="text-[#5145ed]">{selected.name}</strong></> : "Select a product to continue."}
      </p>
      {selected ? <Link href={`/projects/${selected.id}/initiatives/new`} className="mt-6 block rounded-lg bg-[#5145ed] px-4 py-3 text-center text-sm font-semibold text-white hover:bg-[#4238d7]">Continue to feature details</Link>
        : <button type="button" disabled className="mt-6 block w-full rounded-lg bg-[#5145ed] px-4 py-3 text-sm font-semibold text-white opacity-50">Continue to feature details</button>}
    </> : <div className="mt-6 rounded-xl border border-dashed border-[#ccd2e8] p-4 text-sm text-[#44557a]">Create a product before adding a feature. <Link href="/projects/new" className="font-semibold text-[#5145ed] hover:underline">New product →</Link></div>}
    <button type="button" onClick={onClose} className="mt-3 w-full rounded-lg px-4 py-2 text-sm text-[#667089] hover:bg-[#f4f5fe]">Cancel</button>
  </aside>;
}

export default function FeaturesWorkspace({ features, products, canCreate }: {
  features: Feature[];
  products: Product[];
  canCreate: boolean;
}) {
  const searchParams = useSearchParams();
  const [filterProductId, setFilterProductId] = useState("");
  const panelOpen = canCreate && searchParams.get("create") === "feature";
  const requestedProductId = searchParams.get("productId") ?? "";
  const initialProductId = products.some(product => product.id === requestedProductId) ? requestedProductId : "";
  const visibleFeatures = filterProductId ? features.filter(feature => feature.product?.id === filterProductId) : features;
  const closePanel = () => window.history.replaceState(null, "", "/initiatives");

  return <>
    <label htmlFor="features-product-filter" className="mt-6 block text-xs font-semibold text-[#44557a]">Filter features</label>
    <select id="features-product-filter" value={filterProductId} onChange={event => setFilterProductId(event.target.value)} className="mt-1 w-full max-w-sm rounded-lg border border-[#d9deeb] bg-white px-3 py-2.5 text-sm font-medium text-[#0d1b3e] focus:border-[#5145ed] focus:outline-2 focus:outline-[#5145ed]">
      <option value="">All products</option>
      {products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
    </select>

    <div className={`mt-5 grid items-start gap-5 ${panelOpen ? "lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]" : ""}`}>
      <div className="order-last min-w-0 lg:order-first">
        {visibleFeatures.length ? <ul className="space-y-3">
          {visibleFeatures.map(feature => {
            const status = STATUS_META[feature.lifecycle] ?? STATUS_META.draft;
            return <li key={feature.id}>
              <Link href={`/initiatives/${feature.id}/overview`} className="group block rounded-xl border border-[#dfe3f4] bg-white p-5 shadow-[0_8px_28px_rgba(46,71,125,0.06)] transition hover:border-indigo-300 hover:shadow-lg">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-[#0d1b3e] group-hover:text-[#5145ed]">{feature.name}</h2>
                    {feature.description && <p className="mt-1 line-clamp-2 text-sm text-[#667089]">{feature.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge entityType="initiative" entityId={feature.id} status={feature.status} />
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#667089]">
                  {feature.stage && <span className="font-medium text-[#0d1b3e]">{feature.stage}</span>}
                  {feature.baselineApproved && <span className="text-emerald-700">Baseline approved</span>}
                  {feature.jiraConnected && <span className="text-indigo-700">Jira {feature.jiraSynced ? "synced" : "connected"}</span>}
                  <span>Methodology: hybrid waterfall</span>
                  <span className="ml-auto rounded-full bg-[#f0efff] px-3 py-1 font-medium text-[#5145ed]">Product: {feature.product?.name ?? "Unassigned"}</span>
                </div>
              </Link>
            </li>;
          })}
        </ul> : <div className="rounded-xl border border-dashed border-[#ccd2e8] bg-white p-8 text-center text-sm text-[#667089]">
          {filterProductId ? "No features in this product yet." : canCreate ? "No features yet. Use Create → New feature to add one." : "No features available to you yet. Ask a workspace owner to share one."}
        </div>}
      </div>
      {panelOpen && <NewFeaturePanel key={initialProductId} products={products} initialProductId={initialProductId} onClose={closePanel} />}
    </div>
  </>;
}
