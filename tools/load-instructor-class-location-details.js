/**
 * Load instructor↔class↔location mapping rows from a CSV file into:
 *   public.instructor_class_location_details
 *
 * Requirements / rules:
 * - Branch scope: Eastside only (ymca_branches.code = 'eastside_family_ymca')
 * - Text handling: store CSV strings as-is (no normalization/cleanup of stored values)
 * - Minutes fix: treat 765 as 60 wherever it occurs
 * - Uniqueness: (branch_id, instructor_id, class_id, location_id, minutes)
 * - Dedupe exact duplicates (including minutes)
 * - Reference resolution:
 *   - instructors by nickname
 *   - classes by name (branch-scoped)
 *   - locations by name (branch-scoped)
 *   - fail-fast (report all missing/ambiguous; no partial write)
 *
 * Usage:
 *   node tools/load-instructor-class-location-details.js --dry-run --file documents/<file>.csv
 *   node tools/load-instructor-class-location-details.js --apply   --file documents/<file>.csv
 *
 * DB connection (defaults match current local supabase/config.toml):
 *   SUPABASE_DB_HOST=127.0.0.1
 *   SUPABASE_DB_PORT=46322
 *   SUPABASE_DB_USER=postgres
 *   SUPABASE_DB_PASSWORD=postgres
 *   SUPABASE_DB_NAME=postgres
 */

/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { TextDecoder } = require("util");

const DEFAULT_FILE = path.join(
  __dirname,
  "..",
  "documents",
  "2026.01.15.1632.Eastside_Family_YMCA_Instructor_Class_Details_by_Location.csv",
);

const DB = {
  host: process.env.SUPABASE_DB_HOST || "127.0.0.1",
  port: Number.parseInt(process.env.SUPABASE_DB_PORT || "46322", 10),
  user: process.env.SUPABASE_DB_USER || "postgres",
  password: process.env.SUPABASE_DB_PASSWORD || "postgres",
  database: process.env.SUPABASE_DB_NAME || "postgres",
};

function parseArgs(argv) {
  const args = {
    dryRun: true,
    apply: false,
    file: DEFAULT_FILE,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--apply" || a === "--write") {
      args.apply = true;
      args.dryRun = false;
    } else if (a === "--file") {
      const v = argv[i + 1];
      if (!v) throw new Error("--file requires a value");
      args.file = v;
      i += 1;
    } else if (a === "--help" || a === "-h") {
      args.help = true;
    } else if (a.startsWith("--")) {
      throw new Error(`Unknown argument: ${a}`);
    }
  }

  return args;
}

function normalizeLookup(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function normalizeClassForLookup(value) {
  // CSV sometimes contains placeholder characters where the canonical DB name uses ™/®.
  // We only normalize for matching; the stored traceability name will use the canonical DB value.
  const raw = String(value ?? "").trim();

  const candidates = [];

  // 1) Raw as-is
  candidates.push(raw);

  // 2) Common substitution: © in the CSV should be ® in the DB
  if (raw.includes("©")) candidates.push(raw.replace(/©/g, "®"));

  // 3) Common substitution: trailing ? in the CSV should be ™ in the DB
  if (/\?$/.test(raw)) candidates.push(raw.replace(/\?$/g, "™"));

  // 4) Combined substitutions
  if (raw.includes("©") && /\?$/.test(raw)) {
    candidates.push(raw.replace(/©/g, "®").replace(/\?$/g, "™"));
  }

  // Normalize all candidates to lookup keys, preserving insertion order but removing duplicates.
  const keys = [];
  const seen = new Set();
  for (const c of candidates) {
    const k = normalizeLookup(c);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    keys.push(k);
  }
  return keys;
}

function resolveByKeys(map, keys) {
  const all = [];
  for (const k of keys) {
    const matches = map.get(k) ?? [];
    for (const m of matches) all.push(m);
  }

  // De-dupe by id in case multiple candidate keys found the same row.
  const byId = new Map();
  for (const m of all) byId.set(m.id, m);
  return Array.from(byId.values());
}

function splitCsvLine(line) {
  // Basic CSV parsing with support for quoted fields.
  // This file is expected to be simple (no embedded newlines), but may contain commas in quoted fields.
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function decodeTextFile(filePath) {
  const buf = fs.readFileSync(filePath);

  // Try strict UTF-8 first; if it fails, fall back to Windows-1252 (common for Excel/CSV exports on Windows).
  // This ensures characters like ™/® are preserved correctly.
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252", { fatal: false }).decode(buf);
  }
}

function readCsvRows(filePath) {
  const text = decodeTextFile(filePath);
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) throw new Error("CSV is empty");

  const header = splitCsvLine(lines[0]).map((h) => normalizeLookup(h));
  const expected = ["INSTRUCTOR NICKNAME", "CLASS NAME", "MINUTES", "LOCATION"];
  const headerOk =
    header.length === expected.length && expected.every((v, idx) => header[idx] === v);
  if (!headerOk) {
    throw new Error(
      `Unexpected CSV header. Expected: ${expected.join(", ")}. Found: ${header.join(", ")}`,
    );
  }

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parts = splitCsvLine(lines[i]);
    if (parts.length < 4) continue;
    const instructorNickname = String(parts[0] ?? "");
    const className = String(parts[1] ?? "");
    const minutesRaw = String(parts[2] ?? "");
    const locationName = String(parts[3] ?? "");
    rows.push({ instructorNickname, className, minutesRaw, locationName, line: i + 1 });
  }
  return rows;
}

async function loadBranchId(client) {
  const { rows } = await client.query(
    "select id from public.ymca_branches where code = $1",
    ["eastside_family_ymca"],
  );
  if (rows.length !== 1) {
    throw new Error(
      `Expected exactly 1 ymca_branches row for code='eastside_family_ymca', found ${rows.length}`,
    );
  }
  return rows[0].id;
}

async function loadInstructorLookup(client, branchId) {
  // Include instructors owned by this branch and instructors linked via instructor_branches.
  const linked = await client.query(
    "select instructor_id from public.instructor_branches where branch_id = $1",
    [branchId],
  );
  const linkedIds = linked.rows.map((r) => r.instructor_id).filter(Boolean);

  const params = [branchId];
  let where = "where nickname is not null and (branch_id = $1";
  if (linkedIds.length > 0) {
    params.push(linkedIds);
    where += " or id = any($2::uuid[]))";
  } else {
    where += ")";
  }

  const { rows } = await client.query(
    `select id, nickname from public.instructors ${where}`,
    params,
  );

  const map = new Map(); // normalized nickname -> [{id, nickname}]
  for (const r of rows) {
    const key = normalizeLookup(r.nickname);
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push({ id: r.id, nickname: r.nickname });
    map.set(key, list);
  }
  return map;
}

async function loadClassLookup(client, branchId) {
  const { rows } = await client.query(
    "select id, name from public.classes where branch_id = $1",
    [branchId],
  );

  const map = new Map(); // normalized name -> [{id, name}]
  for (const r of rows) {
    const key = normalizeLookup(r.name);
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push({ id: r.id, name: r.name });
    map.set(key, list);
  }
  return map;
}

async function loadLocationLookup(client, branchId) {
  const { rows } = await client.query(
    "select id, name from public.locations where branch_id = $1",
    [branchId],
  );

  const map = new Map(); // normalized name -> [{id, name}]
  for (const r of rows) {
    const key = normalizeLookup(r.name);
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push({ id: r.id, name: r.name });
    map.set(key, list);
  }
  return map;
}

function parseMinutes(minutesRaw) {
  const m = Number.parseInt(String(minutesRaw ?? "").trim(), 10);
  if (!Number.isFinite(m)) return { ok: false, minutes: null };
  if (m === 765) return { ok: true, minutes: 60, coerced: true };
  return { ok: true, minutes: m, coerced: false };
}

function formatList(list, limit = 50) {
  const uniq = Array.from(new Set(list));
  const shown = uniq.slice(0, limit);
  const more = uniq.length > shown.length ? `\n... +${uniq.length - shown.length} more` : "";
  return shown.join("\n") + more;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage:");
    console.log(
      "  node tools/load-instructor-class-location-details.js --dry-run --file documents/<file>.csv",
    );
    console.log(
      "  node tools/load-instructor-class-location-details.js --apply   --file documents/<file>.csv",
    );
    process.exit(0);
  }

  const filePath = path.isAbsolute(args.file) ? args.file : path.join(__dirname, "..", args.file);
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const rows = readCsvRows(filePath);
  const totalRows = rows.length;

  const client = new Client(DB);
  await client.connect();

  try {
    const branchId = await loadBranchId(client);

    const [instLookup, classLookup, locLookup] = await Promise.all([
      loadInstructorLookup(client, branchId),
      loadClassLookup(client, branchId),
      loadLocationLookup(client, branchId),
    ]);

    const missingInstructors = [];
    const ambiguousInstructors = [];
    const missingClasses = [];
    const ambiguousClasses = [];
    const missingLocations = [];
    const ambiguousLocations = [];
    const invalidMinutes = [];

    const coercedMinutesLines = [];

    const prepared = [];
    const dedupeKeySet = new Set(); // raw dedupe key (normalized values + minutes)
    let duplicateCount = 0;

    for (const r of rows) {
      const nickRaw = String(r.instructorNickname ?? "");
      const classRaw = String(r.className ?? "");
      const locRaw = String(r.locationName ?? "");

      const nickKey = normalizeLookup(nickRaw);
      const locKey = normalizeLookup(locRaw);
      const classKeys = normalizeClassForLookup(classRaw);

      const minParsed = parseMinutes(r.minutesRaw);
      if (!minParsed.ok || minParsed.minutes === null) {
        invalidMinutes.push(`L${r.line}: "${r.minutesRaw}" for ${nickRaw} / ${classRaw} / ${locRaw}`);
        continue;
      }
      const minutes = minParsed.minutes;
      if (minParsed.coerced) coercedMinutesLines.push(`L${r.line}: 765→60 (${nickRaw} / ${classRaw} / ${locRaw})`);

      // Dedupe exact duplicates (including minutes) using normalized raw values.
      // Dedupe based on normalized values. For class, use the first normalization candidate (raw as-is),
      // so two lines that differ only by encoding placeholders are still considered distinct in the CSV source.
      const dedupeClassKey = classKeys[0] ?? normalizeLookup(classRaw);
      const dedupeKey = `${nickKey}||${dedupeClassKey}||${locKey}||${minutes}`;
      if (dedupeKeySet.has(dedupeKey)) {
        duplicateCount += 1;
        continue;
      }
      dedupeKeySet.add(dedupeKey);

      const instMatches = instLookup.get(nickKey) ?? [];
      if (instMatches.length === 0) {
        missingInstructors.push(nickRaw);
        continue;
      }
      if (instMatches.length !== 1) {
        ambiguousInstructors.push(`${nickRaw} (${instMatches.length} matches)`);
        continue;
      }

      const classMatches = resolveByKeys(classLookup, classKeys);
      if (classMatches.length === 0) {
        missingClasses.push(classRaw);
        continue;
      }
      if (classMatches.length !== 1) {
        ambiguousClasses.push(`${classRaw} (${classMatches.length} matches)`);
        continue;
      }

      const locMatches = locLookup.get(locKey) ?? [];
      if (locMatches.length === 0) {
        missingLocations.push(locRaw);
        continue;
      }
      if (locMatches.length !== 1) {
        ambiguousLocations.push(`${locRaw} (${locMatches.length} matches)`);
        continue;
      }

      prepared.push({
        branch_id: branchId,
        instructor_id: instMatches[0].id,
        class_id: classMatches[0].id,
        location_id: locMatches[0].id,
        minutes,
        // Store canonical DB names (ensures ™/® are preserved correctly)
        instructor_nickname: instMatches[0].nickname,
        class_name: classMatches[0].name,
        location_name: locMatches[0].name,
      });
    }

    const errors = [
      ...missingInstructors.map(() => 1),
      ...ambiguousInstructors.map(() => 1),
      ...missingClasses.map(() => 1),
      ...ambiguousClasses.map(() => 1),
      ...missingLocations.map(() => 1),
      ...ambiguousLocations.map(() => 1),
      ...invalidMinutes.map(() => 1),
    ].length;

    const summary = {
      file: filePath,
      total_rows_read: totalRows,
      duplicates_skipped: duplicateCount,
      unique_rows_after_dedupe: dedupeKeySet.size,
      valid_rows_ready: prepared.length,
      missing_instructors: Array.from(new Set(missingInstructors)).length,
      ambiguous_instructors: Array.from(new Set(ambiguousInstructors)).length,
      missing_classes: Array.from(new Set(missingClasses)).length,
      ambiguous_classes: Array.from(new Set(ambiguousClasses)).length,
      missing_locations: Array.from(new Set(missingLocations)).length,
      ambiguous_locations: Array.from(new Set(ambiguousLocations)).length,
      invalid_minutes_rows: invalidMinutes.length,
      coerced_765_to_60_rows: coercedMinutesLines.length,
      mode: args.dryRun ? "dry-run" : "apply",
    };

    console.log("\nSummary:");
    console.log(JSON.stringify(summary, null, 2));

    if (coercedMinutesLines.length > 0) {
      console.log("\nMinutes coercions (765→60):");
      console.log(formatList(coercedMinutesLines, 50));
    }

    if (missingInstructors.length > 0) {
      console.log("\nMissing instructors (nickname):");
      console.log(formatList(missingInstructors, 50));
    }
    if (ambiguousInstructors.length > 0) {
      console.log("\nAmbiguous instructors (nickname):");
      console.log(formatList(ambiguousInstructors, 50));
    }
    if (missingClasses.length > 0) {
      console.log("\nMissing classes (name):");
      console.log(formatList(missingClasses, 50));
    }
    if (ambiguousClasses.length > 0) {
      console.log("\nAmbiguous classes (name):");
      console.log(formatList(ambiguousClasses, 50));
    }
    if (missingLocations.length > 0) {
      console.log("\nMissing locations (name):");
      console.log(formatList(missingLocations, 50));
    }
    if (ambiguousLocations.length > 0) {
      console.log("\nAmbiguous locations (name):");
      console.log(formatList(ambiguousLocations, 50));
    }
    if (invalidMinutes.length > 0) {
      console.log("\nInvalid minutes rows:");
      console.log(formatList(invalidMinutes, 50));
    }

    if (errors > 0) {
      console.error(`\nERROR: Found ${errors} validation error(s). No data was written.`);
      process.exit(1);
    }

    if (args.dryRun) {
      console.log("\nDry-run clean. No data written.");
      process.exit(0);
    }

    // Apply mode
    const sourceFileLabel = path.basename(filePath);
    const nowIso = new Date().toISOString();

    await client.query("begin");
    try {
      let insertedOrUpdated = 0;
      for (const row of prepared) {
        const res = await client.query(
          `
          insert into public.instructor_class_location_details (
            branch_id,
            instructor_id,
            class_id,
            location_id,
            minutes,
            instructor_nickname,
            class_name,
            location_name,
            source_file,
            loaded_at
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          on conflict (branch_id, instructor_id, class_id, location_id, minutes)
          do update set
            instructor_nickname = excluded.instructor_nickname,
            class_name = excluded.class_name,
            location_name = excluded.location_name,
            source_file = excluded.source_file,
            loaded_at = excluded.loaded_at
          `,
          [
            row.branch_id,
            row.instructor_id,
            row.class_id,
            row.location_id,
            row.minutes,
            row.instructor_nickname,
            row.class_name,
            row.location_name,
            sourceFileLabel,
            nowIso,
          ],
        );
        // pg's rowCount is 1 for both insert and update in this statement.
        insertedOrUpdated += res.rowCount || 0;
      }

      await client.query("commit");
      console.log(`\nApply complete. Upserted ${insertedOrUpdated} row(s).`);
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("\nFatal error:");
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});


