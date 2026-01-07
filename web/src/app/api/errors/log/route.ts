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

export async function POST(req: Request) {
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
        error_code: body.error_code 
      });
    } else {
      // Insert new error
      const { error: insertError } = await supabase
        .from("error_logs")
        .insert({
          error_code: body.error_code,
          error_type: body.error_type,
          message: body.message,
          branch_id: body.branch_id || null,
          branch_name: body.branch_name || null,
          user_id: body.user_id || null,
          user_email: body.user_email || null,
          context: body.context || null,
          stack_trace: body.stack_trace || null,
          source: body.source,
          url: body.url || null,
          user_agent: body.user_agent || null,
        });

      if (insertError) {
        console.error("Error inserting error log:", insertError);
        return NextResponse.json(
          { error: "Failed to insert error log" },
          { status: 500 }
        );
      }

      return NextResponse.json({ 
        success: true, 
        action: "created",
        error_code: body.error_code 
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

