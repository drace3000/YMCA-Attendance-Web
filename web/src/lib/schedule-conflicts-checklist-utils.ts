import type { Session } from "@/app/scheduling/sessions-tab";
import type { ScheduleConflict } from "@/lib/scheduling/conflict-engine";

export type ConflictChecklistSeverity = "HIGH" | "MEDIUM" | "LOW";

export type ConflictChecklistRow = {
  resolved: string; // manual-only checkbox (e.g., "☐")
  date: string; // MM/DD/YYYY (display)
  dateISO: string; // YYYY-MM-DD (sorting)
  severity: ConflictChecklistSeverity;
  conflict: string; // human-readable conflict message
  sessionA: string;
  sessionB: string;
};

export type ConflictChecklistGroup = {
  severity: ConflictChecklistSeverity;
  rows: ConflictChecklistRow[];
};

function formatDateMmDdYyyy(iso: string): string {
  // iso: YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function getInstructorLabelFromSession(s: Session | null | undefined, instructorId: string): string | null {
  if (!s) return null;
  const inst = s.instructors?.find((i) => i.id === instructorId) ?? null;
  if (!inst) return null;
  const label = (inst.nickname || `${inst.first_name ?? ""} ${inst.last_name ?? ""}`.trim()).trim();
  return label || null;
}

function formatConflictMessageForChecklist(c: ScheduleConflict, a: Session | null, b: Session | null): string {
  const message = c.message || "";

  const meta = (c.meta ?? {}) as Record<string, unknown>;
  const rawIds =
    typeof meta.instructor_id === "string"
      ? [meta.instructor_id]
      : Array.isArray(meta.instructor_ids)
        ? meta.instructor_ids
        : [];

  const instructorIds = rawIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  const hasInstructorContext = instructorIds.length > 0;

  const labels = instructorIds
    .map((id) => getInstructorLabelFromSession(a, id) || getInstructorLabelFromSession(b, id) || id)
    .filter(Boolean);

  const nicknameLabel = labels.join(", ").trim();
  const instructorLabel = nicknameLabel || null;

  // Type-specific formatting (to ensure instructor + human-readable date formats)
  if (c.type === "INSTRUCTOR_OUTSIDE_AVAILABILITY" && a) {
    const date = a.session_date || c.date;
    const start = (a.start_time || "").slice(0, 5) || "—";
    const end = (a.end_time || "").slice(0, 5) || "—";
    const allowed =
      Array.isArray(meta.allowed_windows) && meta.allowed_windows.length > 0
        ? meta.allowed_windows
            .map((w) =>
              w && typeof w === "object" && "start" in w && "end" in w
                ? `${String((w as any).start)}–${String((w as any).end)}`
                : null,
            )
            .filter(Boolean)
            .join(", ")
        : "";
    const suffix = allowed ? `(allowed: ${allowed}).` : "(no availability windows defined for this day).";
    return `Instructor ${instructorLabel || "—"} is not available on ${formatDateMmDdYyyy(date)} during ${start}–${end} ${suffix}`;
  }

  if (c.type === "INSTRUCTOR_TRANSITION_TIME" && hasInstructorContext) {
    const gap = typeof meta.gap_minutes === "number" ? meta.gap_minutes : null;
    const from = typeof meta.from === "string" ? meta.from : "—";
    const to = typeof meta.to === "string" ? meta.to : "—";
    const gapLabel = gap === null ? "too little" : String(gap);
    return `Instructor ${instructorLabel || "—"} transition time warning: only ${gapLabel} minutes between locations (${from} → ${to}).`;
  }

  if (c.type === "INSTRUCTOR_MAX_HOURS" && hasInstructorContext) {
    const total = typeof meta.total_minutes === "number" ? meta.total_minutes : null;
    const max = typeof meta.max_minutes === "number" ? meta.max_minutes : null;
    const totalLabel = total === null ? "—" : String(Math.round(total));
    const maxLabel = max === null ? "—" : String(Math.round(max));
    return `Instructor ${instructorLabel || "—"} warning: exceeds daily max (${totalLabel} minutes scheduled; max ${maxLabel} minutes).`;
  }

  if (!message.startsWith("Instructor ")) return message;
  if (!instructorLabel) return message;

  // Only inject when the original engine message has no nickname:
  // - "Instructor is ..." or "Instructor double-booking: ..."
  if (!/^Instructor\s+(is|double-booking:)/.test(message)) return message;

  return `Instructor ${instructorLabel} ${message.slice("Instructor ".length)}`;
}

function formatSessionSummary(s: Session | null | undefined): string {
  if (!s) return "—";
  const start = (s.start_time || "").slice(0, 5);
  const end = (s.end_time || "").slice(0, 5);
  const klass = s.class?.name || "—";
  const code = (s.location?.code || "").trim();
  const name = (s.location?.name || "").trim();
  const loc = code && name ? `(${code}) ${name}` : code ? code : name ? name : "—";
  return `${start}–${end} • ${klass} • ${loc}`;
}

function severityOrder(sev: ConflictChecklistSeverity): number {
  if (sev === "HIGH") return 0;
  if (sev === "MEDIUM") return 1;
  return 2;
}

export function buildConflictsChecklistGroups({
  conflicts,
  sessions,
}: {
  conflicts: ScheduleConflict[];
  sessions: Session[];
}): ConflictChecklistGroup[] {
  const byId = new Map<string, Session>();
  for (const s of sessions) byId.set(s.id, s);

  const rows: ConflictChecklistRow[] = conflicts
    .map((c) => {
      const sev = c.severity as ConflictChecklistSeverity;
      const a = byId.get(c.session_a_id) ?? null;
      const b = c.session_b_id ? byId.get(c.session_b_id) ?? null : null;
      return {
        resolved: "☐",
        date: formatDateMmDdYyyy(c.date),
        dateISO: c.date,
        severity: sev,
        conflict: formatConflictMessageForChecklist(c, a, b),
        sessionA: formatSessionSummary(a),
        sessionB: b ? formatSessionSummary(b) : "—",
      };
    })
    .filter((r) => r.dateISO && (r.severity === "HIGH" || r.severity === "MEDIUM" || r.severity === "LOW"));

  // Deterministic sorting: group order HIGH→MEDIUM→LOW; then date ascending; then conflict text.
  rows.sort((a, b) => {
    const sevCmp = severityOrder(a.severity) - severityOrder(b.severity);
    if (sevCmp !== 0) return sevCmp;
    const dateCmp = a.dateISO.localeCompare(b.dateISO);
    if (dateCmp !== 0) return dateCmp;
    const msgCmp = a.conflict.localeCompare(b.conflict);
    if (msgCmp !== 0) return msgCmp;
    return a.sessionA.localeCompare(b.sessionA);
  });

  const groups: Record<ConflictChecklistSeverity, ConflictChecklistRow[]> = {
    HIGH: [],
    MEDIUM: [],
    LOW: [],
  };

  for (const r of rows) groups[r.severity].push(r);

  return (["HIGH", "MEDIUM", "LOW"] as const)
    .map((sev) => ({ severity: sev, rows: groups[sev] }))
    .filter((g) => g.rows.length > 0);
}


