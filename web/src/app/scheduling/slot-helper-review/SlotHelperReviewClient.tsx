"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

type RequestRow = {
  id: string;
  created_at: string;
  expires_at: string;
  responded_at: string | null;
  response_selected_hold_ids: string[];
  response_comment: string | null;
};

type RequestContext = {
  branch_id: string;
  schedule_id: string;
  branch_name: string | null;
  schedule_name: string | null;
};

type RequestResponse =
  | { expired: boolean; request: RequestRow; holds: HoldRow[]; context: RequestContext }
  | { error: string };

type PayloadSlot = {
  hold_id: string;
  proposed: { date: string; start_time: string; end_time: string };
};

type HoldRow = {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  released_at: string | null;
  consumed_at: string | null;
};

function formatIsoDateMMDDYYYY(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function formatTimeAmPm(hhmm: string): string {
  const [hRaw, mRaw] = hhmm.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export default function SlotHelperReviewClient() {
  const searchParams = useSearchParams();
  const token = (searchParams.get("t") ?? "").trim();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expired, setExpired] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [request, setRequest] = useState<RequestRow | null>(null);
  const [context, setContext] = useState<RequestContext | null>(null);

  const [holds, setHolds] = useState<HoldRow[]>([]);

  const slots: PayloadSlot[] = useMemo(() => {
    return holds
      .map((h) => ({
        hold_id: h.id,
        proposed: {
          date: h.slot_date,
          start_time: h.start_time,
          end_time: h.end_time,
        },
      }))
      .filter((x) => !!x.hold_id);
  }, [holds]);

  const selectableIds = useMemo(() => slots.map((s) => s.hold_id), [slots]);
  const [selected, setSelected] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allSelected = useMemo(
    () => selectableIds.length > 0 && selectableIds.every((id) => selectedSet.has(id)),
    [selectableIds, selectedSet],
  );

  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setSubmitted(false);
    void (async () => {
      try {
        const res = await fetch(`/api/scheduling/slot-helper-review/request?t=${encodeURIComponent(token)}`);
        const json = (await res.json()) as RequestResponse;
        if (!res.ok || "error" in json) throw new Error("error" in json ? json.error : "Failed to load request");

        const payloadSlotIds = Array.isArray(json.holds) ? json.holds.map((h) => h.id).filter(Boolean) : [];

        setExpired(!!json.expired);
        setRequest(json.request);
        setHolds(json.holds ?? []);
        setContext(json.context);
        setComment(json.request.response_comment ?? "");
        if (json.request.responded_at) {
          setSelected(json.request.response_selected_hold_ids ?? []);
          setSubmitted(true);
        } else {
          // Default: all selected (matches branch manager initial intent).
          setSelected(payloadSlotIds);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load request");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const toggleAll = () => {
    setSelected((prev) => {
      const prevSet = new Set(prev);
      const isAll = selectableIds.length > 0 && selectableIds.every((id) => prevSet.has(id));
      return isAll ? [] : [...selectableIds];
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSubmit = async () => {
    if (!token) return;
    if (expired) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/scheduling/slot-helper-review/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ t: token, selected_hold_ids: selected, comment }),
      });
      const json = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        const msg =
          json && typeof json === "object" && typeof (json as Record<string, unknown>).error === "string"
            ? String((json as Record<string, unknown>).error)
            : "Failed to submit response";
        throw new Error(msg);
      }
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit response");
    } finally {
      setSubmitting(false);
    }
  };

  const expiresLabel = request?.expires_at ? new Date(request.expires_at).toLocaleString() : null;

  return (
    <div className="min-h-screen bg-app-gradient px-4 py-6 sm:px-8">
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-[var(--brand-ink)]">Slot Review</h1>
          <div className="mt-1 text-sm text-[var(--brand-ink)]/70">
            {context?.branch_name ? <span className="font-semibold">{context.branch_name}</span> : null}
            {context?.schedule_name ? <span> — {context.schedule_name}</span> : null}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : expired ? (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
            This link has expired. Please contact your branch manager to request a new link.
          </div>
        ) : submitted ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            Thank you — your response has been submitted.
          </div>
        ) : (
          <>
            <div className="mb-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground">
              <div className="font-semibold">Review and adjust the selected time slots</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {expiresLabel ? `Link expires on ${expiresLabel}.` : "Link expires in 48 hours."}
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between gap-3">
              <button type="button" onClick={toggleAll} className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <div
                  className={`flex h-4 w-4 items-center justify-center rounded border ${
                    allSelected ? "border-[var(--cta-foreground)] bg-[var(--cta-foreground)]/20" : "border-white/30"
                  }`}
                >
                  {allSelected ? <Check className="h-3 w-3" /> : null}
                </div>
                Select all
              </button>
              <div className="text-xs text-muted-foreground">
                Selected: {selected.length}/{selectableIds.length}
              </div>
            </div>

            <div className="space-y-2">
              {slots.map((s) => {
                const checked = selectedSet.has(s.hold_id);
                const dateLabel = formatIsoDateMMDDYYYY(s.proposed.date);
                const startLabel = formatTimeAmPm(s.proposed.start_time);
                const endLabel = formatTimeAmPm(s.proposed.end_time);
                return (
                  <div key={s.hold_id} className="rounded-xl border border-white/10 bg-black/10 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground">{dateLabel}</div>
                        <div className="mt-0.5 text-sm text-foreground/90">
                          {startLabel}–{endLabel}
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label={`Select slot ${s.hold_id}`}
                        onClick={() => toggleOne(s.hold_id)}
                        className="flex flex-shrink-0 items-start justify-center pt-1"
                      >
                        <div
                          className={`flex h-4 w-4 items-center justify-center rounded border ${
                            checked ? "border-[var(--cta-foreground)] bg-[var(--cta-foreground)]/20" : "border-white/30"
                          }`}
                        >
                          {checked ? <Check className="h-3 w-3" /> : null}
                        </div>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-3">
              <div className="text-xs font-semibold text-muted-foreground">Suggestion / note (optional)</div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground shadow-sm ring-1 ring-white/10 focus:outline-none focus:ring-1 focus:ring-[var(--brand-strong)]"
                placeholder="Add any notes or suggested changes here…"
              />
            </div>

            <div className="mt-5 flex items-center justify-end">
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleSubmit()}
                className="rounded-xl bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit response"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

