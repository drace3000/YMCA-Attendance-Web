import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

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
  location: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null;
  instructors?: { id: string; nickname: string; first_name: string; last_name: string; readable_id: string | null }[];
};

type CreateSessionPayload = {
  branch_id: string;
  schedule_id: string;
  class_id: string;
  location_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  session_date: string;
  instructor_ids: string[];
};

type UpdateSessionPayload = {
  id: string;
  class_id?: string;
  location_id?: string;
  day_of_week?: string;
  start_time?: string;
  end_time?: string;
  session_date?: string;
  instructor_ids?: string[];
  headcount?: number | null;
};

// GET - List sessions for a schedule and branch
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const scheduleId = searchParams.get("schedule_id");
  const branchId = searchParams.get("branch_id");

  if (!scheduleId || !branchId) {
    return NextResponse.json(
      { error: "schedule_id and branch_id are required" },
      { status: 400 }
    );
  }

  const supabase = createSupabaseServerClient();

  // Fetch sessions with class and location info
  const { data: sessions, error: sessionsError } = await supabase
    .from("class_sessions")
    .select(`
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
      location:location_id(id, code, name)
    `)
    .eq("schedule_id", scheduleId)
    .eq("branch_id", branchId)
    .order("day_of_week")
    .order("start_time");

  if (sessionsError) {
    return NextResponse.json({ error: sessionsError.message }, { status: 500 });
  }

  // Fetch instructor assignments for all sessions (batch to avoid URI too long)
  const sessionIds = (sessions || []).map((s: { id: string }) => s.id);
  
  let instructorMap: Record<
    string,
    { id: string; nickname: string; first_name: string; last_name: string; readable_id: string | null }[]
  > = {};
  
  if (sessionIds.length > 0) {
    // Batch session IDs to avoid URI too long error
    const BATCH_SIZE = 50;
    const batches: string[][] = [];
    for (let i = 0; i < sessionIds.length; i += BATCH_SIZE) {
      batches.push(sessionIds.slice(i, i + BATCH_SIZE));
    }

    // Fetch all batches in parallel
    const batchResults = await Promise.all(
      batches.map(batch =>
        supabase
          .from("session_instructors")
          .select(`
            session_id,
            instructor:instructor_id(id, nickname, first_name, last_name, readable_id)
          `)
          .in("session_id", batch)
      )
    );

    // Process results from all batches
    for (const { data: instructorLinks, error: instructorError } of batchResults) {
      if (instructorError) {
        console.error("Error fetching instructors:", instructorError);
        continue;
      }
      
      // Group instructors by session_id
      for (const link of instructorLinks || []) {
        const sid = link.session_id;
        if (!instructorMap[sid]) {
          instructorMap[sid] = [];
        }
        if (link.instructor) {
          const inst = Array.isArray(link.instructor) ? link.instructor[0] : link.instructor;
          if (inst) {
            instructorMap[sid].push(inst);
          }
        }
      }
    }
  }

  // Merge instructors into sessions
  const enrichedSessions = (sessions || []).map((session: SessionRow) => ({
    ...session,
    instructors: instructorMap[session.id] || [],
  }));

  return NextResponse.json({ sessions: enrichedSessions });
}

// POST - Create a new session
export async function POST(req: Request) {
  let body: CreateSessionPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const {
    branch_id,
    schedule_id,
    class_id,
    location_id,
    day_of_week,
    start_time,
    end_time,
    session_date,
    instructor_ids,
  } = body;

  if (!branch_id || !schedule_id || !class_id || !location_id || !day_of_week || !start_time || !end_time || !session_date) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const supabase = createSupabaseServerClient();

  // Insert the session
  const { data: session, error: sessionError } = await supabase
    .from("class_sessions")
    .insert({
      branch_id,
      schedule_id,
      class_id,
      location_id,
      day_of_week: day_of_week.toUpperCase(),
      start_time,
      end_time,
      session_date,
      effective_month: session_date.substring(0, 7) + "-01",
    })
    .select()
    .single();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  // Insert instructor assignments
  if (instructor_ids && instructor_ids.length > 0) {
    const instructorLinks = instructor_ids.map((instructor_id) => ({
      session_id: session.id,
      instructor_id,
    }));

    const { error: linkError } = await supabase
      .from("session_instructors")
      .insert(instructorLinks);

    if (linkError) {
      // Session was created but instructor linking failed - return warning
      return NextResponse.json(
        { session, warning: `Session created but instructor linking failed: ${linkError.message}` },
        { status: 201 }
      );
    }
  }

  return NextResponse.json({ session }, { status: 201 });
}

// PUT - Update a session
export async function PUT(req: Request) {
  let body: UpdateSessionPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { id, instructor_ids, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "Session id is required" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  // Update session fields if any
  if (Object.keys(updates).length > 0) {
    const updateData: Record<string, unknown> = { ...updates };
    if (updates.day_of_week) {
      updateData.day_of_week = updates.day_of_week.toUpperCase();
    }

    const { error: updateError } = await supabase
      .from("class_sessions")
      .update(updateData)
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  // Update instructor assignments if provided
  if (instructor_ids !== undefined) {
    // Delete existing assignments
    const { error: deleteError } = await supabase
      .from("session_instructors")
      .delete()
      .eq("session_id", id);

    if (deleteError) {
      return NextResponse.json(
        { error: `Failed to update instructors: ${deleteError.message}` },
        { status: 500 }
      );
    }

    // Insert new assignments
    if (instructor_ids.length > 0) {
      const instructorLinks = instructor_ids.map((instructor_id) => ({
        session_id: id,
        instructor_id,
      }));

      const { error: linkError } = await supabase
        .from("session_instructors")
        .insert(instructorLinks);

      if (linkError) {
        return NextResponse.json(
          { error: `Failed to link instructors: ${linkError.message}` },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE - Delete a session
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Session id is required" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  // session_instructors will be deleted via CASCADE
  const { error } = await supabase
    .from("class_sessions")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}