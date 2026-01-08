// CommonJS version to import NY associations/branches from JSON (derived from Excel)
// Expects: documents/ny_associations.json and documents/ny_branches.json
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase URL or key in env");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function loadJson(rel) {
  const p = path.join(__dirname, "..", rel);
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

async function upsertAssociations(supabase, records) {
  const resultMap = new Map();
  for (const r of records) {
    // check existing by code
    const { data: existing, error: selErr } = await supabase
      .from("ymca_associations")
      .select("id, code")
      .eq("code", r.code)
      .maybeSingle();
    if (selErr) throw selErr;

    if (existing) {
      const { error: updErr } = await supabase
        .from("ymca_associations")
        .update({
          name: r.name,
          short_name: null,
          region: r.region ?? null,
          state_code: "NY",
          is_active: true,
        })
        .eq("id", existing.id);
      if (updErr) throw updErr;
      resultMap.set(r.code, existing.id);
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("ymca_associations")
        .insert({
          code: r.code,
          name: r.name,
          short_name: null,
          region: r.region ?? null,
          state_code: "NY",
          is_active: true,
        })
        .select("id, code")
        .single();
      if (insErr) throw insErr;
      resultMap.set(r.code, inserted.id);
    }
  }
  return resultMap;
}

async function upsertBranches(supabase, records, assocByCode) {
  for (const r of records) {
    const assocId = r.association_code ? assocByCode.get(r.association_code) ?? null : null;
    const { data: existing, error: selErr } = await supabase
      .from("ymca_branches")
      .select("id, code")
      .eq("code", r.code)
      .maybeSingle();
    if (selErr) throw selErr;

    const payload = {
      code: r.code,
      short_code: r.short_code,
      name: r.name,
      association_id: assocId,
      city: r.city ?? null,
      state_code: r.state ?? null,
      zip: r.zip ?? null,
      phone: r.phone ?? null,
      address: r.address ?? null,
      is_active: true,
    };

    if (existing) {
      const { error: updErr } = await supabase.from("ymca_branches").update(payload).eq("id", existing.id);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await supabase.from("ymca_branches").insert(payload);
      if (insErr) throw insErr;
    }
  }
}

async function main() {
  const supabase = getSupabase();
  const associations = loadJson("documents/ny_associations.json");
  const branches = loadJson("documents/ny_branches.json");

  const assocByCode = await upsertAssociations(supabase, associations);
  await upsertBranches(supabase, branches, assocByCode);
  console.log("Import complete. Associations:", associations.length, "Branches:", branches.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
