import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";
import { serverErrorResponse } from "@/lib/server-api-error";
import {
  detectScheduleConflicts,
  getDefaultConflictEngineConfig,
  type InstructorAvailability,
  type ScheduleConflict,
  type SessionForConflicts,
} from "@/lib/scheduling/conflict-engine";
import type { Session } from "@/app/scheduling/sessions-tab";
import { generateSchedulePdfBase64 } from "@/lib/schedule-pdf-server";
import { sendEmailWithPdfAttachment } from "@/lib/email-sender-with-attachments";

export const runtime = "nodejs";

type PublishPayload = {
  schedule_id: string;
  branch_id?: string;
};

type ScheduleRow = {
  id: string;
  name: string;
  month_start: string; // "YYYY-MM-DD"
  status: string;
  is_approved?: boolean;
  published_at: string | null;
  branch_id: string;
  program_group_id: string;
};

type ProgramGroupRow = { id: string; code: string; name: string };

type BranchRow = {
  id: string;
  name: string;
  website_url: string | null;
  theme_color: string | null;
  branch_manager_name: string | null;
  branch_manager_email: string | null;
  schedule_email_from: string | null;
  schedule_email_reply_to: string | null;
  association?:
    | { name: string; alliance?: { name: string } | { name: string }[] | null }
    | { name: string; alliance?: { name: string } | { name: string }[] | null }[]
    | null;
};

type SessionRow = {
  id: string;
  branch_id: string;
  schedule_id: string;
  class_id: string;
  location_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  session_date: string;
  headcount: number | null;
  class: { id: string; name: string } | { id: string; name: string }[] | null;
  location:
    | { id: string; code: string; name: string }
    | { id: string; code: string; name: string }[]
    | null;
};

type InstructorRow = {
  id: string;
  nickname: string | null;
  first_name: string | null;
  last_name: string | null;
  readable_id: string | null;
  auth_user_id: string | null;
};

function normalizeRel<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function isValidEmail(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function POST(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const access = required.access;
  if (access?.recipient_type === "Administrator") {
    // Admins can access scheduling but publishing is intended for branch managers.
    // Keep admins allowed for now (support/testing), but this is where we'd tighten later.
  }

  let body: PublishPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const scheduleId = (body.schedule_id ?? "").trim();
  if (!scheduleId) return NextResponse.json({ error: "schedule_id is required" }, { status: 400 });

  const requestedBranchId = (body.branch_id ?? "").trim() || null;
  const branchId =
    access?.recipient_type === "Branch" && access ? access.branch_id : requestedBranchId ?? access?.branch_id ?? null;
  if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });

  // Branch users cannot publish for other branches
  if (access?.recipient_type === "Branch" && access.branch_id !== branchId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();

  // 1) Load schedule and ensure it's eligible
  const { data: scheduleRow, error: scheduleError } = await supabase
    .from("schedules")
    .select("id, name, month_start, status, is_approved, published_at, branch_id, program_group_id")
    .eq("id", scheduleId)
    .eq("branch_id", branchId)
    .maybeSingle<ScheduleRow>();

  if (scheduleError) {
    return await serverErrorResponse({
      req,
      errorType: "DB_ERROR",
      publicMessage: "Failed to load schedule",
      logMessage: scheduleError.message,
      context: { module: "api.scheduling.publish", action: "select_schedule", scheduleId, branchId },
      err: scheduleError,
    });
  }

  if (!scheduleRow) {
    return NextResponse.json({ error: "Schedule not found for this branch" }, { status: 404 });
  }

  if (scheduleRow.status === "published") {
    return NextResponse.json({ error: "Schedule is already published" }, { status: 409 });
  }

  if (scheduleRow.is_approved === false) {
    return NextResponse.json(
      { error: "Schedule is pending approval; no changes are allowed until approved" },
      { status: 409 },
    );
  }

  const scheduleMonth = scheduleRow.month_start.slice(0, 7);

  // 2) Load sessions for schedule and build conflict-engine sessions
  const { data: rawSessions, error: sessionsError } = await supabase
    .from("class_sessions")
    .select(
      `
        id,
        branch_id,
        schedule_id,
        class_id,
        location_id,
        day_of_week,
        start_time,
        end_time,
        session_date,
        headcount,
        class:class_id(id, name),
        location:locations!class_sessions_branch_location_fkey(id, code, name)
      `,
    )
    .eq("branch_id", branchId)
    .eq("schedule_id", scheduleId)
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true })
    .returns<SessionRow[]>();

  if (sessionsError) {
    return await serverErrorResponse({
      req,
      errorType: "DB_ERROR",
      publicMessage: "Failed to load sessions",
      logMessage: sessionsError.message,
      context: { module: "api.scheduling.publish", action: "select_sessions", scheduleId, branchId },
      err: sessionsError,
    });
  }

  const sessions = rawSessions ?? [];
  const sessionIds = sessions.map((s) => s.id).filter(Boolean);

  const instructorMap: Record<string, string[]> = {};
  if (sessionIds.length > 0) {
    const { data: links, error: linksError } = await supabase
      .from("session_instructors")
      .select("session_id, instructor_id")
      .in("session_id", sessionIds);

    if (linksError) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to load session instructors",
        logMessage: linksError.message,
        context: { module: "api.scheduling.publish", action: "select_session_instructors", scheduleId, branchId },
        err: linksError,
      });
    }

    for (const row of (links ?? []) as Array<{ session_id: string; instructor_id: string }>) {
      if (!row.session_id || !row.instructor_id) continue;
      if (!instructorMap[row.session_id]) instructorMap[row.session_id] = [];
      instructorMap[row.session_id].push(row.instructor_id);
    }
  }

  const engineSessions: SessionForConflicts[] = sessions.map((s) => ({
    id: s.id,
    day_of_week: s.day_of_week,
    session_date: s.session_date,
    start_time: String(s.start_time).slice(0, 5),
    end_time: String(s.end_time).slice(0, 5),
    location_id: s.location_id,
    location_code: normalizeRel(s.location)?.code ?? null,
    class_name: normalizeRel(s.class)?.name ?? null,
    instructor_ids: instructorMap[s.id] ?? [],
  }));

  const allInstructorIds = Array.from(new Set(engineSessions.flatMap((s) => s.instructor_ids).filter(Boolean)));

  // 3) Instructor availability allow-list (HIGH) + Holidays (MEDIUM) for verify gate
  let instructorAvailability: InstructorAvailability[] = [];
  if (allInstructorIds.length > 0) {
    const { data: rows, error: aError } = await supabase
      .from("instructor_availability")
      .select("instructor_id, schedule_month, day_of_week, available_start, available_end")
      .eq("branch_id", branchId)
      .eq("schedule_month", scheduleMonth)
      .in("instructor_id", allInstructorIds);

    if (aError) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to load instructor availability",
        logMessage: aError.message,
        context: { module: "api.scheduling.publish", action: "select_instructor_availability", scheduleId, branchId },
        err: aError,
      });
    }

    instructorAvailability = ((rows ?? []) as any[]).map((r) => ({
      instructor_id: String(r.instructor_id),
      schedule_month: String(r.schedule_month),
      day_of_week: String(r.day_of_week),
      available_start: String(r.available_start).slice(0, 5),
      available_end: String(r.available_end).slice(0, 5),
    }));
  }

  const { data: holidayRows, error: holidayError } = await supabase
    .from("holidays")
    .select("holiday_date, observed_date, name, is_closed, closed_start_time, closed_end_time")
    .eq("branch_id", branchId)
    .eq("is_active", true);

  if (holidayError) {
    return await serverErrorResponse({
      req,
      errorType: "DB_ERROR",
      publicMessage: "Failed to load holidays",
      logMessage: holidayError.message,
      context: { module: "api.scheduling.publish", action: "select_holidays", scheduleId, branchId },
      err: holidayError,
    });
  }

  const holidays = ((holidayRows ?? []) as Array<{
    holiday_date: string;
    observed_date?: string | null;
    name: string;
    is_closed?: boolean;
    closed_start_time?: string | null;
    closed_end_time?: string | null;
  }>)
    .map((r) => ({
      holiday_date: String(r.holiday_date ?? "").slice(0, 10),
      observed_date: r.observed_date ? String(r.observed_date).slice(0, 10) : null,
      name: String(r.name ?? ""),
      is_closed: !!r.is_closed,
      closed_start_time: r.closed_start_time ? String(r.closed_start_time).slice(0, 5) : null,
      closed_end_time: r.closed_end_time ? String(r.closed_end_time).slice(0, 5) : null,
    }))
    .filter((h) => {
      const effective = String((h.observed_date ?? h.holiday_date) ?? "");
      return effective && effective.startsWith(scheduleMonth);
    });

  const conflicts = detectScheduleConflicts(engineSessions, {
    ...getDefaultConflictEngineConfig(),
    scheduleMonth,
    instructorAvailability,
    holidays,
  });

  const summary = conflicts.reduce(
    (acc, c) => {
      acc.total += 1;
      if (c.severity === "HIGH") acc.high += 1;
      if (c.severity === "MEDIUM") acc.medium += 1;
      if (c.severity === "LOW") acc.low += 1;
      return acc;
    },
    { total: 0, high: 0, medium: 0, low: 0 },
  );

  if (summary.high > 0) {
    return NextResponse.json(
      {
        error: "Cannot publish: schedule has HIGH conflict(s). Resolve conflicts, then verify again.",
        summary,
        conflicts: conflicts as ScheduleConflict[],
      },
      { status: 409 },
    );
  }

  // 4) Load instructor details (for PDF + for email mapping)
  let instructorsById: Record<string, InstructorRow> = {};
  if (allInstructorIds.length > 0) {
    const { data: instructorRows, error: instructorError } = await supabase
      .from("instructors")
      .select("id, nickname, first_name, last_name, readable_id, auth_user_id")
      .in("id", allInstructorIds)
      .returns<InstructorRow[]>();

    if (instructorError) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to load instructors",
        logMessage: instructorError.message,
        context: { module: "api.scheduling.publish", action: "select_instructors", scheduleId, branchId },
        err: instructorError,
      });
    }

    instructorsById = Object.fromEntries((instructorRows ?? []).map((i) => [i.id, i]));
  }

  // 5) Build PDF sessions in the same shape the PDF component expects
  const pdfSessions: Session[] = sessions.map((s) => {
    const instructorObjs = (instructorMap[s.id] ?? [])
      .map((id) => instructorsById[id])
      .filter(Boolean)
      .map((i) => ({
        id: i.id,
        nickname: i.nickname ?? "",
        first_name: i.first_name ?? "",
        last_name: i.last_name ?? "",
        readable_id: i.readable_id ?? null,
      }));

    return {
      id: s.id,
      branch_id: s.branch_id,
      schedule_id: s.schedule_id,
      class_id: s.class_id,
      location_id: s.location_id,
      day_of_week: s.day_of_week,
      start_time: String(s.start_time).slice(0, 5),
      end_time: String(s.end_time).slice(0, 5),
      session_date: s.session_date,
      headcount: s.headcount ?? null,
      class: normalizeRel(s.class) ? { id: normalizeRel(s.class)!.id, name: normalizeRel(s.class)!.name } : null,
      location: normalizeRel(s.location)
        ? {
            id: normalizeRel(s.location)!.id,
            code: normalizeRel(s.location)!.code,
            name: normalizeRel(s.location)!.name,
          }
        : null,
      instructors: instructorObjs,
    };
  });

  // 6) Load branch + program group metadata (for PDF + email headers)
  const { data: branchRow, error: branchError } = await supabase
    .from("ymca_branches")
    .select(
      `
        id,
        name,
        website_url,
        theme_color,
        branch_manager_name,
        branch_manager_email,
        schedule_email_from,
        schedule_email_reply_to,
        association:association_id (
          name,
          alliance:alliance_id ( name )
        )
      `,
    )
    .eq("id", branchId)
    .maybeSingle<BranchRow>();

  if (branchError || !branchRow) {
    return await serverErrorResponse({
      req,
      errorType: "DB_ERROR",
      publicMessage: "Failed to load branch",
      logMessage: branchError?.message ?? "Branch not found",
      context: { module: "api.scheduling.publish", action: "select_branch", scheduleId, branchId },
      err: branchError ?? null,
    });
  }

  const associationName = normalizeRel(branchRow.association)?.name ?? null;
  const allianceName = normalizeRel(normalizeRel(branchRow.association)?.alliance)?.name ?? null;

  const { data: groupRow, error: groupError } = await supabase
    .from("program_groups")
    .select("id, code, name")
    .eq("id", scheduleRow.program_group_id)
    .maybeSingle<ProgramGroupRow>();

  if (groupError) {
    return await serverErrorResponse({
      req,
      errorType: "DB_ERROR",
      publicMessage: "Failed to load program group",
      logMessage: groupError.message,
      context: { module: "api.scheduling.publish", action: "select_program_group", scheduleId, branchId },
      err: groupError,
    });
  }

  // 7) Generate PDF (server-side)
  let pdfBase64: string;
  let fileName: string;
  try {
    const pdfRes = await generateSchedulePdfBase64({
      branch: {
        name: branchRow.name,
        alliance_name: allianceName,
        association_name: associationName,
        branch_manager_name: branchRow.branch_manager_name ?? null,
        website_url: branchRow.website_url ?? null,
        theme_color: branchRow.theme_color ?? null,
      },
      schedule: { name: scheduleRow.name, month_start: scheduleRow.month_start },
      programGroup: groupRow ? { name: groupRow.name, code: groupRow.code } : null,
      sessions: pdfSessions,
      criteria: ["Published schedule (full month)"],
    });
    pdfBase64 = pdfRes.pdfBase64;
    fileName = pdfRes.fileName;
  } catch (err) {
    return await serverErrorResponse({
      req,
      errorType: "REPORT_ERROR",
      publicMessage: "Failed to generate schedule PDF",
      logMessage: err instanceof Error ? err.message : "Unknown PDF generation error",
      context: { module: "api.scheduling.publish", action: "generate_pdf", scheduleId, branchId },
      err,
    });
  }

  // 8) Resolve instructor email recipients (via auth_user_id -> branch_schedule_recipients)
  const authUserIds = Array.from(
    new Set(Object.values(instructorsById).map((i) => i.auth_user_id).filter(Boolean) as string[]),
  );

  let instructorEmails: string[] = [];
  if (authUserIds.length > 0) {
    const { data: recipientRows, error: recipientError } = await supabase
      .from("branch_schedule_recipients")
      .select("auth_user_id, email, is_active")
      .in("auth_user_id", authUserIds)
      .eq("is_active", true);

    if (recipientError) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to load instructor email recipients",
        logMessage: recipientError.message,
        context: { module: "api.scheduling.publish", action: "select_recipients", scheduleId, branchId },
        err: recipientError,
      });
    }

    instructorEmails = Array.from(
      new Set(
        ((recipientRows ?? []) as Array<{ email: string | null }>)
          .map((r) => (r.email ? String(r.email).trim().toLowerCase() : ""))
          .filter((e) => isValidEmail(e)),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }

  // 9) Send emails (single send, BCC instructors)
  const branchManagerEmail = isValidEmail(branchRow.branch_manager_email)
    ? String(branchRow.branch_manager_email).trim().toLowerCase()
    : null;

  const fromEmail = isValidEmail(branchRow.schedule_email_from)
    ? String(branchRow.schedule_email_from).trim().toLowerCase()
    : undefined;

  const subject = `${branchRow.name} Schedule — ${scheduleRow.name}`;
  const message =
    `Hello,\n\n` +
    `Attached is the published schedule for ${branchRow.name} (${scheduleRow.name}).\n\n` +
    `Thank you.`;

  let emailResult:
    | { ok: true; messageId?: string; recipientCount: number }
    | { ok: false; reason: string; message?: string }
    | null = null;

  if (instructorEmails.length > 0) {
    const to = branchManagerEmail ? [branchManagerEmail] : [instructorEmails[0]];
    const bcc = branchManagerEmail ? instructorEmails : instructorEmails.slice(1);

    const sendRes = await sendEmailWithPdfAttachment({
      fromName: `${branchRow.name} Scheduler`,
      fromEmail,
      to,
      bcc: bcc.length > 0 ? bcc : undefined,
      subject,
      message,
      pdfBase64,
      fileName,
    });

    if (!sendRes.ok) {
      return await serverErrorResponse({
        req,
        errorType: "EMAIL_ERROR",
        status: sendRes.reason === "not_configured" ? 500 : 502,
        publicMessage:
          sendRes.reason === "not_configured"
            ? "Email service not configured. Missing RESEND_API_KEY."
            : "Failed to send schedule email",
        logMessage: sendRes.message ?? sendRes.reason,
        context: {
          module: "api.scheduling.publish",
          action: "send_email",
          scheduleId,
          branchId,
          recipientCount: instructorEmails.length,
          usedTo: to,
        },
        err: sendRes.message ?? null,
      });
    }

    emailResult = sendRes;
  }

  // 10) Mark schedule published
  const now = new Date().toISOString();
  const { error: publishError } = await supabase
    .from("schedules")
    .update({ status: "published", published_at: now })
    .eq("id", scheduleId)
    .eq("branch_id", branchId);

  if (publishError) {
    return await serverErrorResponse({
      req,
      errorType: "DB_ERROR",
      publicMessage: "Failed to publish schedule",
      logMessage: publishError.message,
      context: { module: "api.scheduling.publish", action: "update_schedule", scheduleId, branchId },
      err: publishError,
    });
  }

  return NextResponse.json({
    success: true,
    schedule_id: scheduleId,
    branch_id: branchId,
    published_at: now,
    email: {
      attempted: instructorEmails.length,
      recipient_count: emailResult?.ok ? emailResult.recipientCount : instructorEmails.length,
      message_id: emailResult && (emailResult as any).messageId ? (emailResult as any).messageId : null,
      used_branch_manager_to: !!branchManagerEmail,
    },
    verify: { summary, medium: summary.medium, low: summary.low, total: summary.total },
    warnings:
      instructorEmails.length === 0
        ? ["No instructor email accounts were found (instructors must have an auth account linked via auth_user_id)."]
        : [],
  });
}


