import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type RecipientRow = {
  id: string;
  branch_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  created_at: string;
};

type CreateRecipientPayload = {
  branch_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
};

// Validation patterns
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\(\d{4}\)\s\d{3}-\d{4}(?:\s?ext\s?\d{1,5})?$/;
const ZIP_REGEX = /^\d{5}(-\d{4})?$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

function validatePhone(phone: string): boolean {
  return phone === "" || PHONE_REGEX.test(phone.trim());
}

function validateZip(zip: string): boolean {
  return zip === "" || ZIP_REGEX.test(zip.trim());
}

// GET - List recipients for a branch
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const branchId = searchParams.get("branch_id");

  if (!branchId) {
    return NextResponse.json({ error: "branch_id is required" }, { status: 400 });
  }

  if (!UUID_REGEX.test(branchId)) {
    return NextResponse.json({ error: "Invalid branch_id format" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("branch_schedule_recipients")
    .select("id, branch_id, email, first_name, last_name, phone, address, city, state, zip_code, created_at")
    .eq("branch_id", branchId)
    .order("email", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST - Create a new recipient
export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();

  let body: CreateRecipientPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { branch_id, email, first_name, last_name, phone, address, city, state, zip_code } = body;

  if (!branch_id) {
    return NextResponse.json({ error: "branch_id is required" }, { status: 400 });
  }

  if (!UUID_REGEX.test(branch_id)) {
    return NextResponse.json({ error: "Invalid branch_id format" }, { status: 400 });
  }

  if (!email?.trim()) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Validate email format
  if (!validateEmail(email)) {
    return NextResponse.json({ error: "Invalid email format (e.g., name@example.com)" }, { status: 400 });
  }

  // Validate phone format if provided
  if (phone && !validatePhone(phone)) {
    return NextResponse.json({ error: "Invalid phone format. Use (1234) 567-8901 or (1234) 567-8901 ext 12345" }, { status: 400 });
  }

  // Validate zip code format if provided
  if (zip_code && !validateZip(zip_code)) {
    return NextResponse.json({ error: "Invalid ZIP code format. Use 12345 or 12345-6789" }, { status: 400 });
  }

  // Check for duplicate email in same branch
  const { data: existing } = await supabase
    .from("branch_schedule_recipients")
    .select("id")
    .eq("branch_id", branch_id)
    .ilike("email", email.trim());

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: "This email is already added for this branch" },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("branch_schedule_recipients")
    .insert({
      branch_id,
      email: email.trim().toLowerCase(),
      first_name: first_name?.trim() || null,
      last_name: last_name?.trim() || null,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      city: city?.trim() || null,
      state: state?.trim().toUpperCase() || null,
      zip_code: zip_code?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// DELETE - Remove a recipient
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  const { error } = await supabase
    .from("branch_schedule_recipients")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
