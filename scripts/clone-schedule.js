/**
 * Clone a schedule from one month to another
 * Maps dates by day-of-week (1st Monday → 1st Monday, etc.)
 * Sets headcount to NULL for all cloned sessions
 */

const { Client } = require('pg');

const SOURCE_MONTH = 'August 2025';
const TARGET_MONTH = 'September 2025';
const TARGET_MONTH_START = '2025-09-01';

// Generate all dates for September 2025 grouped by day of week
function getSeptemberDates() {
  const dates = {};
  for (let day = 1; day <= 30; day++) {
    const date = new Date(2025, 8, day); // Month is 0-indexed
    const dow = date.getDay(); // 0=Sunday, 1=Monday, etc.
    if (!dates[dow]) dates[dow] = [];
    dates[dow].push(`2025-09-${day.toString().padStart(2, '0')}`);
  }
  return dates;
}

// Generate all dates for August 2025 grouped by day of week
function getAugustDates() {
  const dates = {};
  for (let day = 1; day <= 31; day++) {
    const date = new Date(2025, 7, day); // Month is 0-indexed
    const dow = date.getDay();
    if (!dates[dow]) dates[dow] = [];
    dates[dow].push(`2025-08-${day.toString().padStart(2, '0')}`);
  }
  return dates;
}

async function cloneSchedule() {
  const client = new Client({
    host: 'localhost',
    port: 54322,
    database: 'postgres',
    user: 'postgres',
    password: 'postgres'
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Get source schedule
    const sourceResult = await client.query(
      'SELECT id FROM schedules WHERE name = $1',
      [SOURCE_MONTH]
    );
    
    if (sourceResult.rows.length === 0) {
      throw new Error(`Source schedule "${SOURCE_MONTH}" not found`);
    }
    const sourceScheduleId = sourceResult.rows[0].id;
    console.log(`Source schedule ID: ${sourceScheduleId}`);

    // Check if target already exists
    const existingResult = await client.query(
      'SELECT id FROM schedules WHERE name = $1',
      [TARGET_MONTH]
    );
    
    if (existingResult.rows.length > 0) {
      throw new Error(`Target schedule "${TARGET_MONTH}" already exists`);
    }

    // Create target schedule
    const createResult = await client.query(
      'INSERT INTO schedules (name, month_start) VALUES ($1, $2) RETURNING id',
      [TARGET_MONTH, TARGET_MONTH_START]
    );
    const targetScheduleId = createResult.rows[0].id;
    console.log(`Created target schedule ID: ${targetScheduleId}`);

    // Build date mapping (August date → September date)
    const augustDates = getAugustDates();
    const septemberDates = getSeptemberDates();
    const dateMap = {};
    
    for (const dow of Object.keys(augustDates)) {
      const augDates = augustDates[dow];
      const sepDates = septemberDates[dow] || [];
      
      for (let i = 0; i < augDates.length && i < sepDates.length; i++) {
        dateMap[augDates[i]] = sepDates[i];
      }
    }
    
    console.log('Date mapping created:');
    console.log(`  August dates: ${Object.keys(dateMap).length}`);
    console.log(`  Mapped to September: ${Object.values(dateMap).length}`);

    // Get all sessions from source schedule
    const sessionsResult = await client.query(
      `SELECT cs.id, cs.class_id, cs.location_id, cs.session_date, 
              cs.start_time, cs.end_time, cs.day_of_week, cs.branch_id,
              cs.original_time_text
       FROM class_sessions cs
       WHERE cs.schedule_id = $1
       ORDER BY cs.session_date, cs.start_time`,
      [sourceScheduleId]
    );
    
    console.log(`Found ${sessionsResult.rows.length} sessions in ${SOURCE_MONTH}`);

    // Clone sessions with mapped dates
    let inserted = 0;
    let skipped = 0;
    const sessionIdMap = {}; // old session id → new session id

    for (const session of sessionsResult.rows) {
      const oldDate = session.session_date.toISOString().split('T')[0];
      const newDate = dateMap[oldDate];
      
      if (!newDate) {
        skipped++;
        continue;
      }

      const insertResult = await client.query(
        `INSERT INTO class_sessions 
         (schedule_id, class_id, location_id, session_date, start_time, end_time, 
          headcount, day_of_week, branch_id, effective_month, original_time_text)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9, $10)
         RETURNING id`,
        [targetScheduleId, session.class_id, session.location_id, newDate, 
         session.start_time, session.end_time, session.day_of_week, session.branch_id,
         TARGET_MONTH_START, session.original_time_text]
      );
      
      sessionIdMap[session.id] = insertResult.rows[0].id;
      inserted++;
    }

    console.log(`Inserted ${inserted} sessions, skipped ${skipped} (no September equivalent)`);

    // Clone instructor assignments
    let instructorLinks = 0;
    for (const [oldSessionId, newSessionId] of Object.entries(sessionIdMap)) {
      const instructorsResult = await client.query(
        'SELECT instructor_id FROM session_instructors WHERE session_id = $1',
        [oldSessionId]
      );
      
      for (const row of instructorsResult.rows) {
        await client.query(
          'INSERT INTO session_instructors (session_id, instructor_id) VALUES ($1, $2)',
          [newSessionId, row.instructor_id]
        );
        instructorLinks++;
      }
    }

    console.log(`Created ${instructorLinks} instructor assignments`);

    // Verify
    const verifyResult = await client.query(
      `SELECT COUNT(*) as sessions, COUNT(headcount) as with_attendance
       FROM class_sessions WHERE schedule_id = $1`,
      [targetScheduleId]
    );
    
    console.log('\n=== Summary ===');
    console.log(`Schedule: ${TARGET_MONTH}`);
    console.log(`Sessions created: ${verifyResult.rows[0].sessions}`);
    console.log(`With attendance: ${verifyResult.rows[0].with_attendance}`);
    console.log(`NULL attendance: ${verifyResult.rows[0].sessions - verifyResult.rows[0].with_attendance}`);

  } catch (err) {
    console.error('Error:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

cloneSchedule().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
















