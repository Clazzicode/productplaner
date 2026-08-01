"use client";

// Overlay dialog primitive — same visual idiom as LockBar's inline confirm
// (fixed inset overlay, white rounded-2xl panel).

export default function Modal(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!props.open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4"
      onClick={props.onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{props.title}</h2>
          <button
            onClick={props.onClose}
            aria-label="Close"
            className="rounded-lg px-2 py-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>
        <div className="mt-4">{props.children}</div>
      </div>
    </div>
  );
}
