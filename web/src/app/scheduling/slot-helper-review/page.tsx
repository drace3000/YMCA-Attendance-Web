import { Suspense } from "react";
import SlotHelperReviewClient from "./SlotHelperReviewClient";

export default function SlotHelperReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-app-gradient px-4 py-6 sm:px-8">
          <div className="mx-auto w-full max-w-3xl rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">Loading…</div>
          </div>
        </div>
      }
    >
      <SlotHelperReviewClient />
    </Suspense>
  );
}


