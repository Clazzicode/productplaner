"use client";

import { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";
import RequestsLoadingView from "./RequestsLoadingView";

/** Shows the route's loading design while a dynamic layout is still blocking
 * the route fallback. This component must be rendered inside a Requests Link. */
export default function PendingRequestsNavigation() {
  const { pending } = useLinkStatus();
  if (!pending || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-x-0 bottom-0 top-[64px] z-[60] overflow-auto bg-[#f1f0ff] xl:left-[253px]">
      <RequestsLoadingView />
    </div>,
    document.body,
  );
}
