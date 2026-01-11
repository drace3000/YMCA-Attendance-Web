import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";

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

async function validateInstructorsForBranch(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  branchId: string,
  instructorIds: string[],
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const ids = instructorIds.filter(Boolean);
  if (ids.length === 0) return { ok: true };

  const [
    { data: instructorRows, error: instError },
    { data: linkRows, error: linkError },
  ] = await Promise.all([
    supabase.from("instructors").select("id, branch_id").in("id", ids),
    supabase
      .from("instructor_branches")
      .select("instructor_id")
      .eq("branch_id", branchId)
      .in("instructor_id", ids),
  ]);

  if (instError) return { ok: false, status: 500, error: instError.message };
  if (linkError) return { ok: false, status: 500, error: linkError.message };

  const owned = new Set(
    (instructorRows ?? [])
      .filter((r: { id: string; branch_id: string | null }) => r.branch_id === branchId)
      .map((r: { id: string }) => r.id),
  );
  const linked = new Set(
    (linkRows ?? [])
      .map((r: { instructor_id: string }) => r.instructor_id)
      .filter(Boolean),
  );

  const allowed = new Set<string>([...owned, ...linked]);
  const invalid = ids.filter((id) => !allowed.has(id));

  if (invalid.length > 0) {
    return {
      ok: false,
      status: 409,
      error: "Selected instructor is not available for this branch",
    };
  }

  return { ok: true };
}

// GET - List sessions for a schedule and branch
export async function GET(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const { searchParams } = new URL(req.url);
  const scheduleId = searchParams.get("schedule_id");
  const requestedBranchId = searchParams.get("branch_id");

  const branchId =
    required.access?.recipient_type === "Branch"
      ? required.access.branch_id
      : requestedBranchId;

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
      location:locations!class_sessions_branch_location_fkey(id, code, name)
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
export async function POST(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  let body: CreateSessionPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const {
    branch_id: requestedBranchId,
    schedule_id,
    class_id,
    location_id,
    day_of_week,
    start_time,
    end_time,
    session_date,
    instructor_ids,
  } = body;

  const branch_id =
    required.access?.recipient_type === "Branch"
      ? required.access.branch_id
      : requestedBranchId;

  if (!branch_id || !schedule_id || !class_id || !location_id || !day_of_week || !start_time || !end_time || !session_date) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const supabase = createSupabaseServerClient();

  // Ensure the selected location belongs to this branch (friendly error vs DB constraint failure).
  {
    const { data: locationRow, error: locationError } = await supabase
      .from("locations")
      .select("id")
      .eq("id", location_id)
      .eq("branch_id", branch_id)
      .maybeSingle();

    if (locationError) {
      return NextResponse.json({ error: locationError.message }, { status: 500 });
    }

    if (!locationRow) {
      return NextResponse.json(
        { error: "Selected location is not available for this branch" },
        { status: 409 }
      );
    }
  }

  // Ensure selected instructors (if any) are available for this branch.
  if (instructor_ids && instructor_ids.length > 0) {
    const validation = await validateInstructorsForBranch(supabase, branch_id, instructor_ids);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }
  }

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
export async function PUT(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

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

  const getEffectiveBranchIdForSession = async (): Promise<
    { ok: true; branchId: string } | { ok: false; status: number; error: string }
  > => {
    if (required.access?.recipient_type === "Branch") {
      return { ok: true, branchId: required.access.branch_id };
    }

    const { data: sessionRow, error: sessionError } = await supabase
      .from("class_sessions")
      .select("branch_id")
      .eq("id", id)
      .single();

    if (sessionError) return { ok: false, status: 500, error: sessionError.message };
    if (!sessionRow?.branch_id) return { ok: false, status: 404, error: "Session not found" };

    return { ok: true, branchId: sessionRow.branch_id };
  };

  // Friendly validation: if updating location_id, ensure it belongs to the session's branch.
  if (updates.location_id !== undefined) {
    const branchRes = await getEffectiveBranchIdForSession();
    if (!branchRes.ok) {
      return NextResponse.json({ error: branchRes.error }, { status: branchRes.status });
    }
    const effectiveBranchId = branchRes.branchId;

    const { data: locationRow, error: locationError } = await supabase
      .from("locations")
      .select("id")
      .eq("id", updates.location_id)
      .eq("branch_id", effectiveBranchId)
      .maybeSingle();

    if (locationError) {
      return NextResponse.json({ error: locationError.message }, { status: 500 });
    }

    if (!locationRow) {
      return NextResponse.json(
        { error: "Selected location is not available for this branch" },
        { status: 409 }
      );
    }
  }

  // Update session fields if any
  if (Object.keys(updates).length > 0) {
    const updateData: Record<string, unknown> = { ...updates };
    if (updates.day_of_week) {
      updateData.day_of_week = updates.day_of_week.toUpperCase();
    }

    let updateQuery = supabase
      .from("class_sessions")
      .update(updateData)
      .eq("id", id);

    if (required.access?.recipient_type === "Branch") {
      updateQuery = updateQuery.eq("branch_id", required.access.branch_id);
    }

    const { error: updateError } = await updateQuery;

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  // Update instructor assignments if provided
  if (instructor_ids !== undefined) {
    const branchRes = await getEffectiveBranchIdForSession();
    if (!branchRes.ok) {
      return NextResponse.json({ error: branchRes.error }, { status: branchRes.status });
    }

    if (instructor_ids.length > 0) {
      const validation = await validateInstructorsForBranch(
        supabase,
        branchRes.branchId,
        instructor_ids,
      );
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: validation.status });
      }
    }

    // Delete existing assignments
    // (Instructor links are scoped to the session_id; branch scoping is enforced above.)
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
export async function DELETE(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Session id is required" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  // session_instructors will be deleted via CASCADE
  let delQuery = supabase
    .from("class_sessions")
    .delete()
    .eq("id", id);

  if (required.access?.recipient_type === "Branch") {
    delQuery = delQuery.eq("branch_id", required.access.branch_id);
  }

  const { error } = await delQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}