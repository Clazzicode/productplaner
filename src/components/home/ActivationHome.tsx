import Link from "next/link";
import { FocusedLayout } from "@/components/layout/PageLayouts";

/** Give a new workspace one destination before showing feature work. */
export default function ActivationHome(props: { userName: string; greeting: string }) {
  const firstName = props.userName.trim().split(/\s+/)[0];
  return <FocusedLayout className="max-w-3xl">
    <div className="rounded-2xl border border-[#dfe3f4] bg-white p-7 shadow-sm sm:p-10">
      <p className="text-sm font-semibold text-[#5145ed]">Start your product plan</p>
      <h1 className="mt-2 text-3xl font-bold text-[#0d1b3e]">{props.greeting || `Welcome, ${firstName}`}</h1>
      <p className="mt-4 max-w-xl text-base text-slate-600">Choose a product to see its goals and features. If you are starting something new, create a product there. Your feature will get its own backlog automatically.</p>
      <Link href="/projects" className="mt-7 inline-flex min-h-11 items-center rounded-lg bg-[#5145ed] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#4238d7]">Choose or create a product →</Link>
      <p className="mt-5 text-sm text-slate-500">Next: open or create a feature, then plan its backlog.</p>
    </div>
  </FocusedLayout>;
}
