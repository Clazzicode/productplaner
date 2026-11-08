"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { PO_WORKFLOW, type PoWorkflowId } from "@/lib/planning/poWorkflow";

export default function PoWorkflowGuide(props: { initiativeId: string; initiativeName: string }) {
  const [selected, setSelected] = useState<PoWorkflowId>("initiative");
  const regionId = useId();
  const arrowId = useId().replace(/:/g, "");
  const detail = PO_WORKFLOW.find(item => item.id === selected)!;
  return <div className="mx-auto max-w-5xl">
    <div className="mb-9 max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Your Product Owner workspace</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{props.initiativeName}</h1>
      <p className="mt-3 text-base leading-relaxed text-slate-600">Five tools for turning an intended outcome into a sprint roadmap. Select a box to learn what good looks like, then open the work you need.</p>
      <p className="mt-2 text-sm text-slate-500">The arrows suggest a sequence. You can return to any tool as the work develops.</p>
    </div>
    <div className="relative">
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 hidden h-full w-full sm:block" viewBox="0 0 100 656" preserveAspectRatio="none" fill="none">
        <defs><marker id={arrowId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8" fill="#818cf8" /></marker></defs>
        {["M49 88H51", "M75 176V204H25V234", "M49 328H51", "M75 416V444H50V474"].map(d => <path key={d} d={d} stroke="#818cf8" strokeWidth="2" vectorEffect="non-scaling-stroke" markerEnd={"url(#" + arrowId + ")"} />)}
      </svg>
      <div className="relative grid gap-x-8 gap-y-7 sm:grid-cols-2 sm:gap-y-16">
        {PO_WORKFLOW.map((item, index) => <button
          key={item.id} type="button" aria-expanded={selected === item.id} aria-controls={regionId}
          onClick={() => setSelected(item.id)}
          className={"relative min-h-44 rounded-2xl border p-6 text-left shadow-sm transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600 " +
            (index === 4 ? "sm:col-span-2 sm:mx-auto sm:w-[calc(50%-1rem)] " : "") +
            (selected === item.id ? "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100" : "border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md")}
        >
          <span className="mb-3 flex items-center justify-between gap-3"><span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">{index + 1}</span><span className="text-xs font-medium text-slate-500">{item.eyebrow}</span></span>
          <span className="block text-lg font-bold text-slate-950">{item.title}</span>
          <span className="mt-2 block text-sm leading-relaxed text-slate-600">{item.summary}</span>
          <span className="mt-3 block text-xs font-semibold text-indigo-700">See what good looks like →</span>
        </button>)}
      </div>
    </div>
    <section id={regionId} aria-label={detail.title + " guidance"} className="mt-9 rounded-2xl border border-indigo-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">{detail.tab}</p>
      <h2 className="mt-2 text-2xl font-bold text-slate-950">What makes a good {detail.id === "stories" ? "story" : detail.id === "features" ? "feature" : detail.id === "sprint" ? "sprint" : detail.id}?</h2>
      <ul className="mt-4 space-y-2 text-sm leading-relaxed text-slate-700">{detail.good.map(text => <li key={text} className="flex gap-3"><span aria-hidden="true" className="text-emerald-600">✓</span><span>{text}</span></li>)}</ul>
      <div className="mt-5 rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">Example</p><p className="mt-1 text-sm text-slate-800">{detail.example}</p></div>
      <p className="mt-5 text-sm leading-relaxed text-slate-600">{detail.readiness}</p>
      <Link href={"/initiatives/" + props.initiativeId + "/" + detail.destination} className="mt-6 inline-flex rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700">{detail.action} →</Link>
      {detail.id === "stories" && <Link href={"/initiatives/" + props.initiativeId + "/workspace/refinement"} className="ml-5 mt-4 inline-block text-sm font-semibold text-indigo-700">Open refinement →</Link>}
      {detail.id === "sprint" && <Link href={"/initiatives/" + props.initiativeId + "/workspace/sprints"} className="ml-5 mt-4 inline-block text-sm font-semibold text-indigo-700">Create or manage sprints →</Link>}
    </section>
    <p className="mt-6 text-sm text-slate-500">AI can draft or review supplied information when requested. You decide what to accept; approvals and commitments remain explicit.</p>
  </div>;
}
