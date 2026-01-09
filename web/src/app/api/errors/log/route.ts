/**
 * API Route: POST /api/errors/log
 * 
 * Receives client-side errors and persists them to the error_logs table.
 * Groups repeated errors within 1 hour by incrementing occurrence_count.
 * 
 * PRODUCTION CODE - Do not remove during debug cleanup
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { Resend } from "resend";

interface ErrorLogPayload {
  error_code: string;
  error_type: string;
  message: string;
  branch_id?: string | null;
  branch_name?: string | null;
  user_id?: string | null;
  user_email?: string | null;
  context?: Record<string, unknown> | null;
  stack_trace?: string | null;
  source: "client" | "server";
  url?: string | null;
  user_agent?: string | null;
}

type AdminRecipient = {
  email: string;
  first_name: string | null;
  last_name: string | null;
  on_hold?: boolean | null;
};

export async function POST(req: Request): Promise<Response> {
  try {
    const body: ErrorLogPayload = await req.json();
    const supabase = createSupabaseServerClient();

    // Validate required fields
    if (!body.error_code || !body.error_type || !body.message) {
      return NextResponse.json(
        { error: "Missing required fields: error_code, error_type, message" },
        { status: 400 }
      );
    }
    const errorCode = body.error_code.trim();

    // Normalize context to guarantee key fields for digest/email
    const rawContext = (body.context ?? {}) as Record<string, unknown>;
    const moduleName =
      (rawContext.module as string | undefined) ??
      (rawContext.page as string | undefined) ??
      (rawContext.action as string | undefined) ??
      body.source ??
      "Unknown module";
    const criticality =
      (rawContext.criticality as "High" | "Medium" | "Low" | "Unspecified" | undefined) ??
      "Unspecified";
    const description =
      (rawContext.description as string | undefined) ??
      body.message ??
      "No description provided";

    const normalizedContext = {
      ...rawContext,
      module: moduleName,
      criticality,
      description,
    };

    const source = body.source ?? "client";

    // Immediate alert gating (server-only, secret required)
    // This prevents browsers from triggering emails directly.
    const notifySecret = process.env.ERROR_LOG_SECRET || process.env.CRON_SECRET || "";
    const providedSecret = req.headers.get("x-error-log-secret") ?? "";
    const authHeader = req.headers.get("authorization") ?? "";
    const canTriggerImmediateNotify =
      !!notifySecret &&
      (providedSecret === notifySecret || authHeader === `Bearer ${notifySecret}`);

    const shouldImmediateNotify =
      canTriggerImmediateNotify &&
      source === "server" &&
      normalizedContext.criticality === "High";

    // Check if similar error exists in last hour (for grouping)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: existing, error: findError } = await supabase
      .from("error_logs")
      .select("id, occurrence_count")
      .eq("error_type", body.error_type)
      .eq("message", body.message)
      .gte("created_at", oneHourAgo)
      .is("resolved_at", null)
      .limit(1)
      .maybeSingle();

    if (findError) {
      console.error("Error finding existing error log:", findError);
      // Continue to insert new error even if lookup fails
    }

    if (existing) {
      // Increment occurrence count for existing error
      const { error: updateError } = await supabase
        .from("error_logs")
        .update({
          occurrence_count: existing.occurrence_count + 1,
          last_occurred_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (updateError) {
        console.error("Error updating error log:", updateError);
        return NextResponse.json(
          { error: "Failed to update error log" },
          { status: 500 }
        );
      }

      return NextResponse.json({ 
        success: true, 
        action: "incremented",
        error_code: errorCode 
      });
    } else {
      // Insert new error
      const { data: inserted, error: insertError } = await supabase
        .from("error_logs")
        .insert({
          error_code: errorCode,
          error_type: body.error_type,
          message: body.message,
          branch_id: body.branch_id || null,
          branch_name: body.branch_name || null,
          user_id: body.user_id || null,
          user_email: body.user_email || null,
          context: normalizedContext,
          stack_trace: body.stack_trace || null,
          source,
          url: body.url || null,
          user_agent: body.user_agent || null,
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("Error inserting error log:", insertError);
        return NextResponse.json(
          { error: "Failed to insert error log" },
          { status: 500 }
        );
      }

      let immediateNotified = false;
      if (shouldImmediateNotify && inserted?.id) {
        const resendApiKey = process.env.RESEND_API_KEY;
        if (!resendApiKey) {
          console.warn("RESEND_API_KEY not configured - immediate error email skipped");
        } else {
          // Get Administrator recipients (receive all system errors)
          const { data: admins, error: adminsError } = await supabase
            .from("branch_schedule_recipients")
            .select("email, first_name, last_name")
            .eq("recipient_type", "Administrator")
            .eq("on_hold", false)
            .returns<AdminRecipient[]>();

          if (adminsError) {
            console.error("Error querying administrator recipients:", adminsError);
          } else if (!admins || admins.length === 0) {
            console.warn("No Administrator recipients configured for immediate error notifications");
          } else {
            const resend = new Resend(resendApiKey);
            const adminEmails = admins.map((a) => a.email);

            const branchInfo = body.branch_name ? `Branch: ${body.branch_name}` : "Branch: N/A";
            const userInfo = body.user_email ? `User: ${body.user_email}` : "User: Anonymous";
            const moduleInfo = normalizedContext.module || "Unknown module";
            const urlInfo = body.url ? `\nURL: ${body.url}` : "";
            const stackPreview = body.stack_trace
              ? `\nStack: ${body.stack_trace.split("\n").slice(0, 3).join(" | ")}`
              : "";

            const timestamp = new Date().toLocaleString("en-US", {
              timeZone: "America/New_York",
              dateStyle: "full",
              timeStyle: "short",
            });

            const emailText = `YMCA Attendance System - HIGH Severity Error
Generated: ${timestamp}

Error Code: ${errorCode}
Type: ${body.error_type}
Criticality: High
${branchInfo}
${userInfo}
Module: ${moduleInfo}
Detail: ${normalizedContext.description || body.message}${urlInfo}${stackPreview}

---
This alert was triggered by a server-side error log (protected endpoint).
You can also review errors in Supabase Studio > Table Editor > error_logs.`;

            const { error: emailError } = await resend.emails.send({
              from: process.env.RESEND_FROM_EMAIL || "YMCA System <noreply@resend.dev>",
              to: adminEmails,
              subject: `[YMCA] HIGH Severity Error: ${body.error_type} (${errorCode})`,
              text: emailText,
            });

            if (emailError) {
              console.error("Error sending immediate error email:", emailError);
            } else {
              immediateNotified = true;
              const { error: markError } = await supabase
                .from("error_logs")
                .update({ notified_at: new Date().toISOString() })
                .eq("id", inserted.id);

              if (markError) {
                console.error("Error marking error as notified:", markError);
              }
            }
          }
        }
      }

      return NextResponse.json({ 
        success: true, 
        action: "created",
        error_code: errorCode,
        immediate_notified: immediateNotified,
      });
    }
  } catch (err) {
    console.error("Error logging endpoint failed:", err);
    return NextResponse.json(
      { error: "Failed to process error log" },
      { status: 500 }
    );
  }
}

