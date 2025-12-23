/**
 * Load a single month's session data into Supabase
 * Usage: node load-month.js "May 2024"
 * 
 * Process:
 * 1. Extract from Excel to CSV (if not already done)
 * 2. Create schedule record if missing
 * 3. Auto-add missing classes, instructors, locations
 * 4. Load CSV into staging table
 * 5. Upsert into class_sessions and session_instructors
 * 6. Report results
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { extractMonth, TAB_MAPPINGS } = require('./extract-excel-month');

// Branch ID for Eastside Family YMCA
const BRANCH_ID = '26d6acb8-5acf-4a32-ac24-343f30b1442c';

// Database connection
const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// Tab name to database schedule name mapping
const SCHEDULE_NAMES = {
  'May 2024': { name: 'May 2024', monthStart: '2024-05-01' },
  'JUNE 2024': { name: 'June 2024', monthStart: '2024-06-01' },
  'July 2024': { name: 'July 2024', monthStart: '2024-07-01' },
  'August 2024': { name: 'August 2024', monthStart: '2024-08-01' },
  'Sept 2024': { name: 'September 2024', monthStart: '2024-09-01' },
  'Oct 2024': { name: 'October 2024', monthStart: '2024-10-01' },
  'Nov 2024': { name: 'November 2024', monthStart: '2024-11-01' },
  'Dec 2024': { name: 'December 2024', monthStart: '2024-12-01' },
  'September 2025': { name: 'September 2025', monthStart: '2025-09-01' },
  'October 2025': { name: 'October 2025', monthStart: '2025-10-01' },
  'November 2025': { name: 'November 2025', monthStart: '2025-11-01' },
  'December 2025': { name: 'December 2025', monthStart: '2025-12-01' }
};

/**
 * Parse CSV file and return array of session objects
 * CSV format: Day,Start Time,End Time,Class Name,Location,Instructors,Date 1,Attendance 1,...
 * Instructors column uses pipe separator: "JENN W|ROBERT"
 */
function parseCSV(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.trim().split('\n');
  const sessions = [];
  
  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    // Simple CSV parse (no quoted fields with commas expected)
    const parts = line.split(',');
    
    // Parse instructors from pipe-separated column
    const instructorsStr = parts[5] || '';
    const instructors = instructorsStr.split('|').map(s => s.trim()).filter(s => s);
    
    const session = {
      day: parts[0],
      startTime: parts[1],
      endTime: parts[2],
      className: parts[3],
      location: parts[4],
      instructors, // Array of instructor names
      datePairs: []
    };
    
    // Parse date/attendance pairs (up to 5) - now starting at index 6
    // Handle null attendance (empty string in CSV)
    for (let j = 0; j < 5; j++) {
      const dateIdx = 6 + (j * 2);
      const attIdx = 7 + (j * 2);
      
      if (parts[dateIdx]) {
        const attVal = parts[attIdx];
        // Handle empty attendance - set to null
        const attendance = (attVal && attVal.trim() !== '') ? parseInt(attVal, 10) : null;
        session.datePairs.push({
          date: parts[dateIdx],
          attendance: attendance
        });
      }
    }
    
    if (session.datePairs.length > 0) {
      sessions.push(session);
    }
  }
  
  return sessions;
}

/**
 * Parse time string like "7:15 am" to "07:15:00"
 */
function parseTime(timeStr) {
  if (!timeStr) return null;
  
  const match = timeStr.trim().match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!match) return null;
  
  let hour = parseInt(match[1], 10);
  const minute = match[2];
  const period = match[3].toLowerCase();
  
  if (period === 'pm' && hour !== 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  
  return `${hour.toString().padStart(2, '0')}:${minute}:00`;
}

/**
 * Parse date string like "5/4" with year context
 */
function parseDate(dateStr, year, month) {
  if (!dateStr) return null;
  
  const parts = dateStr.split('/');
  if (parts.length !== 2) return null;
  
  const m = parseInt(parts[0], 10);
  const d = parseInt(parts[1], 10);
  
  // Determine year based on month (handles year boundary)
  let y = year;
  if (month >= 11 && m <= 2) y = year + 1; // December data might have January dates
  if (month <= 2 && m >= 11) y = year - 1; // January data might have December dates
  
  return `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
}

/**
 * Get day of week from date string
 */
function getDayOfWeek(dateStr) {
  const date = new Date(dateStr);
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  return days[date.getDay()];
}

async function loadMonth(tabName) {
  const scheduleInfo = SCHEDULE_NAMES[tabName];
  if (!scheduleInfo) {
    console.error(`Unknown tab: ${tabName}`);
    process.exit(1);
  }
  
  const yearMonth = TAB_MAPPINGS[tabName];
  
  // Extract to CSV
  console.log(`\n=== Extracting ${tabName} from Excel ===`);
  const { sessions: extractedSessions, outputFile } = extractMonth(tabName);
  
  // Parse CSV
  console.log(`\n=== Parsing CSV ===`);
  const sessions = parseCSV(outputFile);
  console.log(`Parsed ${sessions.length} sessions from CSV`);
  
  // Connect to database
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log('Connected to database');
  
  try {
    // 1. Create or get schedule
    console.log(`\n=== Creating/Getting Schedule: ${scheduleInfo.name} ===`);
    let scheduleResult = await client.query(
      `SELECT id FROM schedules WHERE month_start = $1`,
      [scheduleInfo.monthStart]
    );
    
    let scheduleId;
    if (scheduleResult.rows.length === 0) {
      const insertResult = await client.query(
        `INSERT INTO schedules (id, name, month_start, status, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'draft', now())
         RETURNING id`,
        [scheduleInfo.name, scheduleInfo.monthStart]
      );
      scheduleId = insertResult.rows[0].id;
      console.log(`Created new schedule: ${scheduleId}`);
    } else {
      scheduleId = scheduleResult.rows[0].id;
      console.log(`Using existing schedule: ${scheduleId}`);
    }
    
    // 2. Collect unique classes, instructors, locations
    const uniqueClasses = new Set();
    const uniqueInstructors = new Set();
    const uniqueLocations = new Set();
    
    for (const session of sessions) {
      if (session.className) uniqueClasses.add(session.className);
      // Handle array of instructors
      for (const instructor of session.instructors) {
        if (instructor) uniqueInstructors.add(instructor);
      }
      if (session.location) uniqueLocations.add(session.location);
    }
    
    console.log(`\n=== Reference Data ===`);
    console.log(`Unique classes: ${uniqueClasses.size}`);
    console.log(`Unique instructors: ${uniqueInstructors.size}`);
    console.log(`Unique locations: ${uniqueLocations.size}`);
    
    // 3. Auto-add missing classes
    console.log(`\n=== Checking/Adding Classes ===`);
    const classMap = new Map(); // name -> id
    for (const className of uniqueClasses) {
      let result = await client.query(
        `SELECT id FROM classes WHERE branch_id = $1 AND name = $2`,
        [BRANCH_ID, className]
      );
      
      if (result.rows.length === 0) {
        const insertResult = await client.query(
          `INSERT INTO classes (id, branch_id, name, is_active, created_at)
           VALUES (gen_random_uuid(), $1, $2, true, now())
           RETURNING id`,
          [BRANCH_ID, className]
        );
        classMap.set(className, insertResult.rows[0].id);
        console.log(`  Added class: ${className}`);
      } else {
        classMap.set(className, result.rows[0].id);
      }
    }
    
    // 4. Auto-add missing instructors
    console.log(`\n=== Checking/Adding Instructors ===`);
    const instructorMap = new Map(); // nickname -> id
    for (const instructor of uniqueInstructors) {
      if (!instructor) continue;
      
      let result = await client.query(
        `SELECT id FROM instructors WHERE branch_id = $1 AND nickname = $2`,
        [BRANCH_ID, instructor]
      );
      
      if (result.rows.length === 0) {
        // Try to find by raw_name as fallback
        result = await client.query(
          `SELECT id FROM instructors WHERE branch_id = $1 AND UPPER(raw_name) = $2`,
          [BRANCH_ID, instructor.toUpperCase()]
        );
      }
      
      if (result.rows.length === 0) {
        const insertResult = await client.query(
          `INSERT INTO instructors (id, branch_id, nickname, raw_name, is_active, created_at)
           VALUES (gen_random_uuid(), $1, $2, $2, true, now())
           RETURNING id`,
          [BRANCH_ID, instructor]
        );
        instructorMap.set(instructor, insertResult.rows[0].id);
        console.log(`  Added instructor: ${instructor}`);
      } else {
        instructorMap.set(instructor, result.rows[0].id);
      }
    }
    
    // 5. Auto-add missing locations
    console.log(`\n=== Checking/Adding Locations ===`);
    const locationMap = new Map(); // code -> id
    for (const location of uniqueLocations) {
      if (!location) continue;
      
      let result = await client.query(
        `SELECT id FROM locations WHERE code = $1`,
        [location]
      );
      
      if (result.rows.length === 0) {
        const insertResult = await client.query(
          `INSERT INTO locations (id, code, name, is_active, created_at)
           VALUES (gen_random_uuid(), $1, $1, true, now())
           RETURNING id`,
          [location]
        );
        locationMap.set(location, insertResult.rows[0].id);
        console.log(`  Added location: ${location}`);
      } else {
        locationMap.set(location, result.rows[0].id);
      }
    }
    
    // 6. Insert class sessions
    console.log(`\n=== Inserting Class Sessions ===`);
    let insertedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    const errors = [];
    
    for (const session of sessions) {
      const classId = classMap.get(session.className);
      const locationId = locationMap.get(session.location);
      
      if (!classId) {
        errors.push({ session, error: `Class not found: ${session.className}` });
        errorCount++;
        continue;
      }
      
      if (!locationId) {
        errors.push({ session, error: `Location not found: ${session.location}` });
        errorCount++;
        continue;
      }
      
      const startTime = parseTime(session.startTime);
      const endTime = parseTime(session.endTime);
      
      if (!startTime || !endTime) {
        errors.push({ session, error: `Invalid time: ${session.startTime} - ${session.endTime}` });
        errorCount++;
        continue;
      }
      
      // Insert each date/attendance pair as a separate session
      for (const datePair of session.datePairs) {
        const sessionDate = parseDate(datePair.date, yearMonth.year, yearMonth.month);
        if (!sessionDate) {
          errors.push({ session, datePair, error: `Invalid date: ${datePair.date}` });
          errorCount++;
          continue;
        }
        
        try {
          // Upsert session
          const upsertResult = await client.query(
            `INSERT INTO class_sessions 
             (id, branch_id, schedule_id, class_id, location_id, day_of_week, start_time, end_time, session_date, effective_month, headcount, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
             ON CONFLICT (branch_id, schedule_id, class_id, location_id, day_of_week, start_time, end_time, session_date)
             DO UPDATE SET headcount = EXCLUDED.headcount
             RETURNING id, (xmax = 0) as inserted`,
            [
              BRANCH_ID,
              scheduleId,
              classId,
              locationId,
              session.day,
              startTime,
              endTime,
              sessionDate,
              scheduleInfo.monthStart,
              datePair.attendance
            ]
          );
          
          const sessionId = upsertResult.rows[0].id;
          const wasInserted = upsertResult.rows[0].inserted;
          
          if (wasInserted) insertedCount++;
          else updatedCount++;
          
          // Add instructor(s) - handle array of instructors
          for (const instructor of session.instructors) {
            if (instructor && instructorMap.has(instructor)) {
              await client.query(
                `INSERT INTO session_instructors (session_id, instructor_id)
                 VALUES ($1, $2)
                 ON CONFLICT DO NOTHING`,
                [sessionId, instructorMap.get(instructor)]
              );
            }
          }
        } catch (err) {
          errors.push({ session, datePair, error: err.message });
          errorCount++;
        }
      }
    }
    
    // 7. Report results
    console.log(`\n=== Results ===`);
    console.log(`Sessions inserted: ${insertedCount}`);
    console.log(`Sessions updated: ${updatedCount}`);
    console.log(`Errors: ${errorCount}`);
    
    // Get final counts
    const countResult = await client.query(
      `SELECT COUNT(*) as sessions, COUNT(DISTINCT session_date) as dates
       FROM class_sessions WHERE schedule_id = $1`,
      [scheduleId]
    );
    console.log(`\nTotal sessions in ${scheduleInfo.name}: ${countResult.rows[0].sessions}`);
    console.log(`Total unique dates: ${countResult.rows[0].dates}`);
    
    // Write errors to file if any
    if (errors.length > 0) {
      const errorDir = path.join(__dirname, '..', 'backups', 'exceptions');
      if (!fs.existsSync(errorDir)) {
        fs.mkdirSync(errorDir, { recursive: true });
      }
      const errorFile = path.join(errorDir, `${tabName.toLowerCase().replace(/\s+/g, '_')}_errors.json`);
      fs.writeFileSync(errorFile, JSON.stringify(errors, null, 2), 'utf8');
      console.log(`\nErrors written to: ${errorFile}`);
    }
    
    return {
      scheduleId,
      scheduleName: scheduleInfo.name,
      inserted: insertedCount,
      updated: updatedCount,
      errors: errorCount,
      totalSessions: parseInt(countResult.rows[0].sessions),
      totalDates: parseInt(countResult.rows[0].dates)
    };
    
  } finally {
    await client.end();
    console.log('\nDatabase connection closed');
  }
}

// Run if called directly
if (require.main === module) {
  const tabName = process.argv[2];
  const skipValidation = process.argv.includes('--skip-validation');
  
  if (!tabName) {
    console.log('Usage: node load-month.js "Tab Name" [--skip-validation]');
    console.log('Available tabs:', Object.keys(SCHEDULE_NAMES).join(', '));
    process.exit(1);
  }
  
  loadMonth(tabName)
    .then(async (result) => {
      console.log('\n=== LOAD COMPLETE ===');
      console.log(JSON.stringify(result, null, 2));
      
      // Run validation and update status file
      if (!skipValidation) {
        console.log('\n=== RUNNING VALIDATION ===');
        const { validateMonth } = require('./validate-month-load');
        await validateMonth(result.scheduleName, result);
      }
    })
    .catch(err => {
      console.error('Load failed:', err);
      process.exit(1);
    });
}

module.exports = { loadMonth };












