/**
 * API Route: POST /api/errors/digest
 * 
 * Sends email digest of critical/repeated errors to Administrator recipients.
 * Triggered by cron job (hourly) or manually for testing.
 * 
 * Recipients are determined by recipient_type = 'Administrator' in branch_schedule_recipients.
 * 
 * PRODUCTION CODE - Do not remove during debug cleanup
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { Resend } from "resend";

interface ErrorLog {
  id: string;
  error_code: string;
  error_type: string;
  message: string;
  branch_name: string | null;
  user_email: string | null;
  occurrence_count: number;
  created_at: string;
  url: string | null;
  source?: string | null;
  context?: {
    page?: string;
    action?: string;
    params?: Record<string, unknown>;
    criticality?: "High" | "Medium" | "Low";
    description?: string;
    module?: string;
  } | null;
  stack_trace?: string | null;
}

interface AdminRecipient {
  email: string;
  first_name: string | null;
  last_name: string | null;
}

export async function POST(req: Request): Promise<Response> {
  try {
    // Verify authorization (cron secret or admin token)
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    // Allow if CRON_SECRET matches or if in development without secret configured
    const isAuthorized = 
      (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
      (!cronSecret && process.env.NODE_ENV === "development");
    
    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = createSupabaseServerClient();
    
    // Check if Resend API key is configured
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.warn("RESEND_API_KEY not configured - email digest will be skipped");
      return NextResponse.json(
        { error: "Email service not configured" },
        { status: 500 }
      );
    }

    const resend = new Resend(resendApiKey);

    // Get unnotified errors with 3+ occurrences OR any error older than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: errors, error: queryError } = await supabase
      .from("error_logs")
      .select("id, error_code, error_type, message, branch_name, user_email, occurrence_count, created_at, url, source, context, stack_trace")
      .is("notified_at", null)
      .is("resolved_at", null)
      .or(`occurrence_count.gte.3,created_at.lt.${oneHourAgo}`)
      .order("occurrence_count", { ascending: false })
      .returns<ErrorLog[]>();

    if (queryError) {
      console.error("Error querying error logs:", queryError);
      return NextResponse.json(
        { error: "Failed to query error logs" },
        { status: 500 }
      );
    }

    if (!errors || errors.length === 0) {
      return NextResponse.json({ 
        message: "No errors to report",
        errors_count: 0,
        recipients_count: 0
      });
    }

    // Get Administrator recipients from branch_schedule_recipients
    // Administrators receive ALL system errors regardless of branch
    const { data: admins, error: adminsError } = await supabase
      .from("branch_schedule_recipients")
      .select("email, first_name, last_name")
      .eq("recipient_type", "Administrator")
      .eq("on_hold", false)
      .returns<AdminRecipient[]>();

    if (adminsError) {
      console.error("Error querying administrator recipients:", adminsError);
      return NextResponse.json(
        { error: "Failed to query administrator recipients" },
        { status: 500 }
      );
    }

    if (!admins || admins.length === 0) {
      console.warn("No Administrator recipients configured for error notifications");
      return NextResponse.json(
        { 
          error: "No Administrator recipients configured",
          hint: "Add recipients with recipient_type = 'Administrator' in branch_schedule_recipients"
        },
        { status: 500 }
      );
    }

    const adminEmails = admins.map(a => a.email);

    // Format email content
    const errorSummary = errors.map(e => {
      const branchInfo = e.branch_name ? `Branch: ${e.branch_name}` : "Branch: N/A";
      const userInfo = e.user_email ? `User: ${e.user_email}` : "User: Anonymous";
      const moduleInfo =
        e.context?.module ||
        e.context?.page ||
        e.context?.action ||
        e.source ||
        "Module: N/A";
      const criticality = e.context?.criticality || "Unspecified";
      const detail = e.context?.description || e.message;
      const urlInfo = e.url ? `\n  URL: ${e.url}` : "";
      const stackPreview = e.stack_trace
        ? `\n  Stack: ${e.stack_trace.split("\n").slice(0, 2).join(" | ")}`
        : "";
      return `- [${e.error_code}] ${e.error_type} (${e.occurrence_count}x)\n  ${branchInfo} | ${userInfo}\n  Module: ${moduleInfo}\n  Criticality: ${criticality}\n  Detail: ${detail}${urlInfo}${stackPreview}`;
    }).join("\n\n");

    const timestamp = new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "full",
      timeStyle: "short",
    });

    const emailText = `YMCA Attendance System - Error Digest
Generated: ${timestamp}
Sent to: ${admins.length} Administrator(s)

${errors.length} error(s) require attention:

${errorSummary}

---
View full details in Supabase Studio > Table Editor > error_logs
To resolve an error, set resolved_at to the current timestamp.`;

    // Send email
    const { error: emailError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "YMCA System <noreply@resend.dev>",
      to: adminEmails,
      subject: `[YMCA] Error Digest: ${errors.length} issue(s) require attention`,
      text: emailText,
    });

    if (emailError) {
      console.error("Error sending digest email:", emailError);
      return NextResponse.json(
        { error: "Failed to send digest email", details: emailError },
        { status: 500 }
      );
    }

    // Mark errors as notified
    const errorIds = errors.map(e => e.id);
    const { error: updateError } = await supabase
      .from("error_logs")
      .update({ notified_at: new Date().toISOString() })
      .in("id", errorIds);

    if (updateError) {
      console.error("Error marking errors as notified:", updateError);
      // Don't fail the request - email was sent successfully
    }

    return NextResponse.json({
      success: true,
      message: `Digest sent to ${admins.length} administrator(s)`,
      errors_notified: errors.length,
      recipients: adminEmails,
    });

  } catch (err) {
    console.error("Error digest endpoint failed:", err);
    return NextResponse.json(
      { error: "Failed to process error digest" },
      { status: 500 }
    );
  }
}

// GET endpoint for checking digest status (development/debugging)
export async function GET(): Promise<Response> {
  const supabase = createSupabaseServerClient();
  
  // Count unnotified errors
  const { count: unnotifiedCount } = await supabase
    .from("error_logs")
    .select("*", { count: "exact", head: true })
    .is("notified_at", null)
    .is("resolved_at", null);

  // Count administrators
  const { count: adminCount } = await supabase
    .from("branch_schedule_recipients")
    .select("*", { count: "exact", head: true })
    .eq("recipient_type", "Administrator")
    .eq("on_hold", false);

  return NextResponse.json({
    status: "ready",
    unnotified_errors: unnotifiedCount || 0,
    administrator_recipients: adminCount || 0,
    cron_secret_configured: !!process.env.CRON_SECRET,
    resend_configured: !!process.env.RESEND_API_KEY,
  });
}

