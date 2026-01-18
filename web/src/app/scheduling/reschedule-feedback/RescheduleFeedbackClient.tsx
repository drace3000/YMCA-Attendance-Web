"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

type RequestRow = {
  id: string;
  created_at: string;
  expires_at: string;
  responded_at: string | null;
  response_selected_session_ids: string[];
  request_payload: any;
};

type RequestContext = {
  branch_id: string;
  schedule_id: string;
  instructor_id: string;
  branch_name: string | null;
  schedule_name: string | null;
  instructor_label: string;
};

type RequestResponse =
  | { expired: boolean; request: RequestRow; context: RequestContext }
  | { error: string };

type PayloadRow = {
  session_id: string;
  current: { date: string; start: string; end: string; class: string; location: string };
  proposed?: { date: string; start: string; end: string };
};

export default function RescheduleFeedbackClient() {
  const searchParams = useSearchParams();
  const token = (searchParams.get("t") ?? "").trim();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const [expired, setExpired] = useState(false);
  const [request, setRequest] = useState<RequestRow | null>(null);
  const [context, setContext] = useState<RequestContext | null>(null);

  const rows: PayloadRow[] = useMemo(() => {
    const raw = request?.request_payload;
    const list = Array.isArray(raw?.rows) ? raw.rows : [];
    return list
      .map((r: any) => ({
        session_id: String(r.session_id ?? ""),
        current: {
          date: String(r.current?.date ?? ""),
          start: String(r.current?.start ?? ""),
          end: String(r.current?.end ?? ""),
          class: String(r.current?.class ?? ""),
          location: String(r.current?.location ?? ""),
        },
        proposed: r.proposed
          ? { date: String(r.proposed.date ?? ""), start: String(r.proposed.start ?? ""), end: String(r.proposed.end ?? "") }
          : undefined,
      }))
      .filter((r: PayloadRow) => !!r.session_id);
  }, [request]);

  const selectableIds = useMemo(() => rows.filter((r) => !!r.proposed?.date).map((r) => r.session_id), [rows]);

  const [selected, setSelected] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allSelected = useMemo(() => selectableIds.length > 0 && selectableIds.every((id) => selectedSet.has(id)), [
    selectableIds,
    selectedSet,
  ]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setSubmitted(false);
    void (async () => {
      try {
        const res = await fetch(`/api/scheduling/reschedule-feedback/request?t=${encodeURIComponent(token)}`);
        const json = (await res.json()) as RequestResponse;
        if (!res.ok || "error" in json) throw new Error("error" in json ? json.error : "Failed to load request");

        setExpired(!!json.expired);
        setRequest(json.request);
        setContext(json.context);
        // Default: unchecked (instructor chooses explicitly)
        setSelected([]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load request");
      } finally {
        setLoading(false);
      }
    })();
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
      const res = await fetch("/api/scheduling/reschedule-feedback/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token, selected_session_ids: selected }),
      });
      const json = (await res.json()) as any;
      if (!res.ok) throw new Error(json?.error || "Failed to submit feedback");
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit feedback");
    } finally {
      setSubmitting(false);
    }
  };

  const expiresLabel = request?.expires_at ? new Date(request.expires_at).toLocaleString() : null;

  return (
    <div className="min-h-screen bg-app-gradient px-4 py-6 sm:px-8">
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-[var(--brand-ink)]">Reschedule Feedback</h1>
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
            This link has expired. Please contact your branch manager to request a new reschedule feedback link.
          </div>
        ) : submitted ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            Thank you — your feedback has been submitted.
          </div>
        ) : (
          <>
            <div className="mb-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground">
              <div className="font-semibold">{context?.instructor_label ?? "Instructor"}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Select the proposed reschedules you approve. {expiresLabel ? `Link expires on ${expiresLabel}.` : null}
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
              {rows.map((r) => {
                const selectable = !!r.proposed?.date;
                const checked = selectedSet.has(r.session_id);
                return (
                  <div key={r.session_id} className="rounded-xl border border-white/10 bg-black/10 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-foreground/80">Current Schedule</div>
                        <div className="text-sm font-semibold text-foreground">{r.current.date}</div>
                        <div className="text-xs text-foreground/80">
                          {r.current.start} – {r.current.end}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {r.current.class} · {r.current.location}
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-foreground/80">Availability to Reschedule</div>
                            {r.proposed ? (
                              <>
                                <div className="text-sm font-semibold text-foreground">{r.proposed.date}</div>
                                <div className="text-xs text-foreground/80">
                                  {r.proposed.start} – {r.proposed.end}
                                </div>
                              </>
                            ) : (
                              <div className="text-sm text-muted-foreground">No available reschedule option.</div>
                            )}
                          </div>

                          <button
                            type="button"
                            aria-label={`Select session ${r.session_id}`}
                            disabled={!selectable}
                            onClick={() => toggleOne(r.session_id)}
                            className="flex flex-shrink-0 items-start justify-center pt-1 disabled:cursor-not-allowed disabled:opacity-50"
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
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-end">
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleSubmit()}
                className="rounded-xl bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit Feedback"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


