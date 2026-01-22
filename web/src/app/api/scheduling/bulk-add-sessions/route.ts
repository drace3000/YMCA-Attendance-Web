import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";
import { sendEmail } from "@/lib/email-sender";
import { buildSessionConfirmationEmail } from "@/lib/email-templates";

type SlotInput = { date: string; start_time: string; end_time: string };
type EmailOptions = {
  send_to_instructors?: boolean;
  send_to_manager?: boolean;
  manager_email?: string | null;
};
type BulkAddPayload = {
  branch_id?: string;
  schedule_id: string;
  schedule_year?: number | null;
  schedule_month?: number | null;
  class_id: string;
  location_id: string;
  instructor_ids: string[];
  slots: SlotInput[];
  email?: EmailOptions;
};

type InstructorRow = {
  id: string;
  nickname: string | null;
  first_name: string | null;
  last_name: string | null;
  auth_user_id: string | null;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  return !!v && EMAIL_REGEX.test(v);
}

function dayOfWeekFromIsoDateUtc(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const d = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }).toUpperCase();
}

function buildScheduleLabel(year?: number | null, month?: number | null): string {
  if (!year || !month) return "—";
  const iso = `${year}-${String(month).padStart(2, "0")}-01T00:00:00Z`;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  const monthName = d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return `${monthName} / ${year}`;
}

export async function POST(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  let body: BulkAddPayload;
  try {
    body = (await req.json()) as BulkAddPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const scheduleId = String(body.schedule_id ?? "").trim();
  const classId = String(body.class_id ?? "").trim();
  const locationId = String(body.location_id ?? "").trim();
  const instructorIds = Array.isArray(body.instructor_ids)
    ? body.instructor_ids.map((x) => String(x ?? "").trim()).filter(Boolean)
    : [];
  const slots = Array.isArray(body.slots) ? body.slots : [];

  const access = required.access;
  const branchId =
    access?.recipient_type === "Branch" && access
      ? access.branch_id
      : body.branch_id ?? access?.branch_id ?? null;

  if (!branchId) {
    return NextResponse.json({ error: "branch_id is required" }, { status: 400 });
  }

  if (!scheduleId || !classId || !locationId || slots.length === 0) {
    return NextResponse.json(
      { error: "schedule_id, class_id, location_id, and slots are required" },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();

  const { data: scheduleRow, error: scheduleError } = await supabase
    .from("schedules")
    .select("id, branch_id, month_start, is_approved, name")
    .eq("id", scheduleId)
    .eq("branch_id", branchId)
    .maybeSingle<{ id: string; branch_id: string; month_start: string | null; is_approved?: boolean | null; name: string | null }>();

  if (scheduleError) {
    return NextResponse.json({ error: scheduleError.message }, { status: 500 });
  }
  if (!scheduleRow) {
    return NextResponse.json({ error: "Selected schedule is not available for this branch" }, { status: 409 });
  }
  if (scheduleRow.is_approved === false) {
    return NextResponse.json(
      { error: "Schedule is pending approval; no changes are allowed until approved" },
      { status: 409 },
    );
  }

  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .select("id, name")
    .eq("id", classId)
    .eq("branch_id", branchId)
    .maybeSingle<{ id: string; name: string }>();

  if (classError) {
    return NextResponse.json({ error: classError.message }, { status: 500 });
  }
  if (!classRow) {
    return NextResponse.json({ error: "Selected class is not available for this branch" }, { status: 409 });
  }

  const { data: locationRow, error: locationError } = await supabase
    .from("locations")
    .select("id, code, name")
    .eq("id", locationId)
    .eq("branch_id", branchId)
    .maybeSingle<{ id: string; code: string | null; name: string | null }>();

  if (locationError) {
    return NextResponse.json({ error: locationError.message }, { status: 500 });
  }
  if (!locationRow) {
    return NextResponse.json({ error: "Selected location is not available for this branch" }, { status: 409 });
  }

  const insertRows = slots.map((slot) => ({
    branch_id: branchId,
    schedule_id: scheduleId,
    class_id: classId,
    location_id: locationId,
    day_of_week: dayOfWeekFromIsoDateUtc(slot.date),
    start_time: String(slot.start_time ?? "").slice(0, 5),
    end_time: String(slot.end_time ?? "").slice(0, 5),
    session_date: String(slot.date ?? ""),
  }));

  const { data: createdSessions, error: insertError } = await supabase
    .from("class_sessions")
    .insert(insertRows)
    .select("id, session_date, start_time, end_time");

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const created = Array.isArray(createdSessions) ? createdSessions : [];

  if (created.length > 0 && instructorIds.length > 0) {
    const linkRows = created.flatMap((row) =>
      instructorIds.map((instructorId) => ({ session_id: row.id, instructor_id: instructorId })),
    );
    const { error: linkError } = await supabase.from("session_instructors").insert(linkRows);
    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }
  }

  const emailOptions = body.email ?? {};
  const sendToInstructors = Boolean(emailOptions.send_to_instructors);
  const sendToManager = Boolean(emailOptions.send_to_manager);
  const managerEmailRaw = typeof emailOptions.manager_email === "string" ? emailOptions.manager_email.trim() : "";
  const managerEmailFallback =
    required.ok && "access" in required && required.access?.email ? required.access.email : "";
  const managerEmailResolved = isValidEmail(managerEmailRaw)
    ? managerEmailRaw
    : isValidEmail(managerEmailFallback)
      ? managerEmailFallback
      : "";

  let emailResult: { ok: boolean; recipients: string[]; error?: string } = {
    ok: true,
    recipients: [],
  };

  if (sendToInstructors || sendToManager) {
    const { data: branchRow } = await supabase
      .from("ymca_branches")
      .select("id, name, schedule_email_from")
      .eq("id", branchId)
      .maybeSingle<{ id: string; name: string; schedule_email_from: string | null }>();

    const { data: instructorRows, error: instError } = await supabase
      .from("instructors")
      .select("id, nickname, first_name, last_name, auth_user_id")
      .in("id", instructorIds);

    if (instError) {
      return NextResponse.json({ error: instError.message }, { status: 500 });
    }

    const authIds = (instructorRows ?? [])
      .map((row: InstructorRow) => row.auth_user_id)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0);

    const { data: recipientRows, error: recError } = await supabase
      .from("branch_schedule_recipients")
      .select("auth_user_id, email, is_active")
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .in("auth_user_id", authIds);

    if (recError) {
      return NextResponse.json({ error: recError.message }, { status: 500 });
    }

    const emailByAuthId = new Map<string, string>();
    for (const row of recipientRows ?? []) {
      if (row && isValidEmail(row.email)) {
        emailByAuthId.set(row.auth_user_id, row.email.trim().toLowerCase());
      }
    }

    const instructorEmails = (instructorRows ?? [])
      .map((row: InstructorRow) => {
        if (row.auth_user_id && emailByAuthId.has(row.auth_user_id)) return emailByAuthId.get(row.auth_user_id) ?? null;
        return null;
      })
      .filter((email): email is string => isValidEmail(email));

    const toList: string[] = [];
    let instructorEmailLabel = "—";
    if (sendToInstructors) {
      if (instructorEmails.length > 0) {
        toList.push(...instructorEmails);
        instructorEmailLabel = instructorEmails.join(", ");
      } else {
        toList.push("don.race@outlook.com");
        instructorEmailLabel = "don.race@outlook.com (Temporary)";
      }
    }
    if (sendToManager && isValidEmail(managerEmailResolved)) {
      toList.push(managerEmailResolved.toLowerCase());
    }

    const recipients = Array.from(new Set(toList));
    if (recipients.length > 0) {
      const instructorLabel =
        (instructorRows ?? [])
          .map((row: InstructorRow) => row.nickname || `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim())
          .filter(Boolean)
          .join(", ") || "Instructor";

      const scheduleLabel = buildScheduleLabel(body.schedule_year ?? null, body.schedule_month ?? null);
      const locationLabel = locationRow?.code ? `${locationRow.code} - ${locationRow.name ?? ""}`.trim() : locationRow?.name ?? "—";
      const email = buildSessionConfirmationEmail({
        scheduleLabel,
        className: classRow.name,
        instructorLabel,
        instructorEmail: sendToInstructors ? instructorEmailLabel : "—",
        managerEmail: isValidEmail(managerEmailResolved) ? managerEmailResolved : "—",
        locationName: locationLabel || "—",
        slots: created.map((row) => ({
          date: row.session_date,
          start_time: row.start_time,
          end_time: row.end_time,
        })),
      });

      const sendRes = await sendEmail({
        to: recipients,
        fromName: branchRow?.name ? `${branchRow.name} Scheduler` : undefined,
        fromEmail: isValidEmail(branchRow?.schedule_email_from) ? branchRow?.schedule_email_from?.trim().toLowerCase() : undefined,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      emailResult = sendRes.ok
        ? { ok: true, recipients }
        : { ok: false, recipients, error: sendRes.message ?? "Failed to send email" };
    }
  }

  return NextResponse.json({
    created_session_ids: created.map((row) => row.id),
    email: emailResult,
  });
}
