/**
 * Load sessions from the master Excel workbook using MAPSTO mappings.
 * - Ensures MAPSTO classes/instructors exist (locations assumed present).
 * - Creates schedules per month (Jan–Nov 2025 sheets).
 * - Inserts class_sessions per dated occurrence with headcount when provided.
 *
 * Assumptions:
 * - Local Supabase dev DB on 127.0.0.1:54322 user postgres/password postgres.
 * - Branch scoped to Eastside Family YMCA.
 * - Excel layout matches "Group X Attendance Tracking.xlsx" (day blocks across columns).
 */

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { Client } = require("pg");

const EXCEL_PATH = path.join(
  __dirname,
  "..",
  "documents",
  "Group X Attendance Tracking.xlsx",
);
const MAP_CSV = path.join(
  __dirname,
  "..",
  "backups",
  "excel_db_comparison_utf8.csv",
);

// Database config - can be overridden via environment variables
const DB = {
  host: process.env.SUPABASE_DB_HOST || "127.0.0.1",
  port: parseInt(process.env.SUPABASE_DB_PORT || "54322", 10),
  user: process.env.SUPABASE_DB_USER || "postgres",
  password: process.env.SUPABASE_DB_PASSWORD || "postgres",
  database: process.env.SUPABASE_DB_NAME || "postgres",
};

// Eastside Family YMCA branch (can be overridden via environment)
const EASTSIDE_BRANCH_ID = process.env.EASTSIDE_BRANCH_ID || "fe613a91-9c4a-4a3e-a7d6-a1be8eef7fab";

const DAY_NAMES = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

function readMapping() {
  const text = fs.readFileSync(MAP_CSV, "utf8");
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift();
  if (!header.startsWith("Type")) throw new Error("Bad mapping header");
  const maps = {
    CLASS: new Map(),
    INSTRUCTOR: new Map(),
    LOCATION: new Map(),
  };
  const mapstoSets = {
    CLASS: new Set(),
    INSTRUCTOR: new Set(),
    LOCATION: new Set(),
  };
  for (const line of lines) {
    if (!line.trim()) continue;
    // naive CSV split (no embedded commas in our file)
    const parts = line.split(/,(.+)/); // split once on first comma
    const type = parts[0];
    const rest = (parts[1] || "").split(/,(.+)/);
    const value = rest[0];
    const mapsto = (rest[1] || "").replace(/,(YES|NO)$/i, "").replace(/^"+|"+$/g, "");
    const key = (value || "").trim().toUpperCase();
    const msto = (mapsto || "").trim();
    if (!maps[type]) continue;
    if (key) maps[type].set(key, msto);
    if (msto) mapstoSets[type].add(msto);
  }
  return { maps, mapstoSets };
}

function excelSerialToDate(num) {
  const d = XLSX.SSF.parse_date_code(num);
  if (!d) return null;
  // JS Date months are 0-based
  return new Date(Date.UTC(d.y, d.m - 1, d.d));
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function normalizeLookup(value) {
  return (value || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function normalizeLocation(value) {
  return normalizeLookup(value).replace(/[()]/g, "");
}

function parseTimeRange(rangeText) {
  if (!rangeText || typeof rangeText !== "string") return null;
  const txt = rangeText.trim().toUpperCase();
  const m = txt.match(
    /^(\d{1,2}:\d{2})- ?(\d{1,2}:\d{2})(AM|PM)?\.?$/,
  );
  if (!m) return null;
  const [, start, end, suffixMaybe] = m;
  
  // Parse hours to determine correct AM/PM assignment
  const startHour = parseInt(start.split(":")[0], 10);
  const endHour = parseInt(end.split(":")[0], 10);
  
  // Determine suffixes - handle noon-crossing times (e.g., "11:15-12:15pm")
  let endSuffix = suffixMaybe || txt.match(/AM|PM/)?.[0] || "";
  let startSuffix = endSuffix;
  
  // If end is 12 with PM suffix and start is 10 or 11, start should be AM
  // (handles cases like "11:15-12:15pm" meaning 11:15 AM to 12:15 PM)
  if (endSuffix === "PM" && endHour === 12 && startHour >= 10 && startHour < 12) {
    startSuffix = "AM";
  }
  
  const to24 = (hhmm, suf) => {
    let [h, m] = hhmm.split(":").map(Number);
    if (suf === "PM" && h < 12) h += 12;
    if (suf === "AM" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
  };
  const start24 = to24(start, startSuffix);
  const end24 = to24(end, endSuffix);
  // If end <= start, roll end forward 12 hours to satisfy constraint
  const toMinutes = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  let adjEnd = end24;
  if (toMinutes(end24) <= toMinutes(start24)) {
    const [h, m] = end24.split(":").map(Number);
    const total = h * 60 + m + 12 * 60;
    const hh = Math.floor(total / 60) % 24;
    const mm = total % 60;
    adjEnd = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
  }
  if (toMinutes(adjEnd) <= toMinutes(start24)) return null;
  return {
    start: start24,
    end: adjEnd,
  };
}

function splitInstructors(cell) {
  if (!cell || typeof cell !== "string") return [];
  return cell
    .split(/[\/,&]/)
    .map((s) => s.replace(/\./g, "").trim())
    .filter(Boolean);
}

function detectDayBlocks(headerRow) {
  const blocks = [];
  for (let c = 0; c < headerRow.length; c++) {
    const val = headerRow[c];
    if (typeof val === "string" && DAY_NAMES.includes(val.trim().toUpperCase())) {
      const day = val.trim().toUpperCase();
      // find next day start to know span
      let next = headerRow.length;
      for (let k = c + 1; k < headerRow.length; k++) {
        const v2 = headerRow[k];
        if (typeof v2 === "string" && DAY_NAMES.includes(v2.trim().toUpperCase())) {
          next = k;
          break;
        }
      }
      blocks.push({ day, startCol: c, endCol: next });
    }
  }
  return blocks;
}

function extractDateCols(headerRow, block) {
  const dateCols = [];
  const dateValues = [];
  for (let c = block.startCol; c < block.endCol; c++) {
    const v = headerRow[c];
    if (typeof v === "number") {
      const dt = excelSerialToDate(v);
      if (dt) {
        dateCols.push(c);
        dateValues.push(dt);
      }
    }
    if (typeof v === "string" && /^\d{1,2}\/\d{1,2}/.test(v)) {
      const dt = new Date(v);
      if (!isNaN(dt)) {
        dateCols.push(c);
        dateValues.push(dt);
      }
    }
  }
  block.dateCols = dateCols;
  block.dateValues = dateValues;
}

async function ensureRefs(client, mapstoSets) {
  // Classes
  const classRes = await client.query("SELECT name FROM classes");
  const existingClasses = new Set(classRes.rows.map((r) => r.name));
  const missingClasses = [...mapstoSets.CLASS].filter((n) => !existingClasses.has(n));
  for (const name of missingClasses) {
    await client.query(
      "INSERT INTO classes (name, is_active) VALUES ($1, true) ON CONFLICT (name) DO NOTHING",
      [name],
    );
  }

  // Instructors
  const instRes = await client.query(
    "SELECT nickname FROM instructors WHERE nickname IS NOT NULL",
  );
  const existingInst = new Set(instRes.rows.map((r) => r.nickname));
  const missingInst = [...mapstoSets.INSTRUCTOR].filter(
    (n) => n && !existingInst.has(n),
  );
  for (const nick of missingInst) {
    await client.query(
      `INSERT INTO instructors (nickname, raw_name, branch_id, is_active)
       SELECT $1, $1, $2, true
       WHERE NOT EXISTS (
         SELECT 1 FROM instructors WHERE branch_id = $2 AND nickname = $1
       )`,
      [nick, EASTSIDE_BRANCH_ID],
    );
  }
}

async function loadWorkbook() {
  const wb = XLSX.readFile(EXCEL_PATH);
  const sheets = wb.SheetNames.filter((n) => /\b(2024|2025)\b/i.test(n));
  return { wb, sheets };
}

async function main() {
  const { maps, mapstoSets } = readMapping();
  const client = new Client(DB);
  await client.connect();
  try {
    await ensureRefs(client, mapstoSets);

    // Cache IDs
    const classId = {};
    (await client.query("SELECT id, name FROM classes")).rows.forEach(
      (r) => (classId[r.name] = r.id),
    );
    const instructorId = {};
    (
      await client.query(
        "SELECT id, nickname FROM instructors WHERE nickname IS NOT NULL",
      )
    ).rows.forEach((r) => (instructorId[r.nickname] = r.id));
    const locationId = {};
    (await client.query("SELECT id, code FROM locations")).rows.forEach(
      (r) => (locationId[r.code] = r.id),
    );

    const { wb, sheets } = await loadWorkbook();
    console.log("Sheets:", sheets.join(", "));

    for (const sheetName of sheets) {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
      if (rows.length < 4) continue;
      const headerRow = rows[3]; // day names + dates row (row 4 in Excel)
      const blocks = detectDayBlocks(headerRow);
      blocks.forEach((b) => extractDateCols(headerRow, b));
      const minDate = blocks
        .flatMap((b) => b.dateValues || [])
        .sort((a, b) => a - b)[0];
      const parsedSheetDate = new Date(`${sheetName} 01`);
      let monthStart = !isNaN(parsedSheetDate) ? parsedSheetDate : minDate;
      if (!monthStart && minDate) monthStart = minDate;
      if (!monthStart) {
        console.log(`Skipping ${sheetName} (no dates found)`);
        continue;
      }
      monthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1));
      const monthStartStr = formatDate(monthStart);

      // ensure schedule
      const schedRes = await client.query(
        "SELECT id FROM schedules WHERE month_start=$1",
        [monthStartStr],
      );
      let scheduleId;
      if (schedRes.rowCount) {
        scheduleId = schedRes.rows[0].id;
      } else {
        const ins = await client.query(
          "INSERT INTO schedules (name, month_start, status) VALUES ($1,$2,'draft') RETURNING id",
          [`${sheetName} Schedule`, monthStartStr],
        );
        scheduleId = ins.rows[0].id;
      }

      let inserted = 0;
      for (let r = 4; r < rows.length; r++) {
        const row = rows[r];
        for (const block of blocks) {
          const timeText = row[block.startCol];
          const classRaw = row[block.startCol + 1];
          const locRaw = row[block.startCol + 2];
          const instRaw = row[block.startCol + 3];
          if (!timeText || !classRaw || !locRaw) continue;

          const timeRange = parseTimeRange(String(timeText));
          if (!timeRange) continue;
          const classKey = normalizeLookup(String(classRaw));
          const locKey = normalizeLocation(String(locRaw));
          const instList = splitInstructors(String(instRaw || ""));

          const classMapsto = maps.CLASS.get(classKey);
          const locMapsto = maps.LOCATION.get(locKey);
          const instMapstos = instList
            .map((nm) => maps.INSTRUCTOR.get(normalizeLookup(nm)))
            .filter(Boolean);

          if (!classMapsto || !locMapsto) continue;
          const clsId = classId[classMapsto];
          const locId = locationId[locMapsto];
          if (!clsId || !locId) continue;

          const instIds = instMapstos
            .map((nm) => instructorId[nm])
            .filter(Boolean);

          for (let idx = 0; idx < block.dateCols.length; idx++) {
            const colIdx = block.dateCols[idx];
            const sessionDate = block.dateValues[idx];
            if (!sessionDate) continue;
            const headVal = row[colIdx];
            const headcount =
              typeof headVal === "number" ? Math.trunc(headVal) : null;
            const sessionDateStr = formatDate(sessionDate);

            try {
              const res = await client.query(
                `INSERT INTO class_sessions
                   (class_id, location_id, day_of_week, start_time, end_time, original_time_text,
                    schedule_id, headcount, session_date, branch_id, effective_month)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                 ON CONFLICT (schedule_id, class_id, location_id, day_of_week, start_time, end_time, session_date)
                 DO UPDATE SET headcount = EXCLUDED.headcount
                 RETURNING id`,
                [
                  clsId,
                  locId,
                  block.day,
                  timeRange.start,
                  timeRange.end,
                  String(timeText),
                  scheduleId,
                  headcount,
                  sessionDateStr,
                  EASTSIDE_BRANCH_ID,
                  monthStartStr,
                ],
              );
              const sessionId = res.rows[0].id;
              if (sessionId) {
                await client.query(
                  "DELETE FROM session_instructors WHERE session_id=$1",
                  [sessionId],
                );
                for (const iid of instIds) {
                  await client.query(
                    "INSERT INTO session_instructors (session_id, instructor_id) VALUES ($1,$2)",
                    [sessionId, iid],
                  );
                }
              }
              inserted++;
            } catch (err) {
              console.error("Insert session error", err.message);
            }
          }
        }
      }
      console.log(`${sheetName}: inserted/updated ${inserted} occurrences`);
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

