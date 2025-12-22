/**
 * Extract a single month tab from the Excel file to CSV format
 * Usage: node extract-excel-month.js "May 2024"
 * 
 * The Excel has a horizontal layout with days across columns:
 * - Each day section: Time, Class, Location, Instructor, Date1, Date2, Date3, Date4, Date5, Total, Avg
 * - Days run: SATURDAY, SUNDAY, MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { lookupClass, lookupInstructor, lookupLocation, getKnownInstructors } = require('./mapping-utils');

// Cache for known instructors (loaded once)
let knownInstructorsCache = null;

// Tab name to month/year mapping
const TAB_MAPPINGS = {
  'May 2024': { year: 2024, month: 5 },
  'JUNE 2024': { year: 2024, month: 6 },
  'July 2024': { year: 2024, month: 7 },
  'August 2024': { year: 2024, month: 8 },
  'Sept 2024': { year: 2024, month: 9 },
  'Oct 2024': { year: 2024, month: 10 },
  'Nov 2024': { year: 2024, month: 11 },
  'Dec 2024': { year: 2024, month: 12 },
  'September 2025': { year: 2025, month: 9 },
  'October 2025': { year: 2025, month: 10 },
  'November 2025': { year: 2025, month: 11 },
  'December 2025': { year: 2025, month: 12 },
  // Existing months (already loaded)
  'Jan 2025': { year: 2025, month: 1 },
  'Feb 2025': { year: 2025, month: 2 },
  'Mar 2025': { year: 2025, month: 3 },
  'April 2025': { year: 2025, month: 4 },
  'May 2025': { year: 2025, month: 5 },
  'June 2025': { year: 2025, month: 6 },
  'July 2025': { year: 2025, month: 7 },
  'August 2025': { year: 2025, month: 8 }
};

// Day order and column structure
const DAYS = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

/**
 * Convert Excel serial date to JS Date
 */
function excelDateToJS(serial) {
  if (!serial || typeof serial !== 'number') return null;
  // Excel epoch is 1900-01-01 (but has a bug treating 1900 as leap year)
  // JS epoch is 1970-01-01
  const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
  const jsDate = new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
  return jsDate;
}

/**
 * Format date as M/D for CSV
 */
function formatDate(date) {
  if (!date) return '';
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * Parse time string like "7:15-7:45am" into start and end times
 * Handles cases like "11:15-12:15pm" where start is AM and end is PM
 * 
 * Key insight: When only end has am/pm:
 * - "11:15-12:15pm" means 11:15 AM to 12:15 PM (12 is special - noon)
 * - "5:30-6:30pm" means 5:30 PM to 6:30 PM (same period)
 * - "11:30-12:15am" is likely a typo, should be treated as 11:30 AM to 12:15 PM
 */
function parseTimeRange(timeStr) {
  if (!timeStr) return { start: '', end: '' };
  
  const str = timeStr.toString().trim();
  
  // Match patterns like "7:15-7:45am", "5:15 am-6:00 am", "10:00am-11:00am", "11:30-12:15pm"
  const match = str.match(/(\d{1,2}):(\d{2})\s*(am|pm)?\s*[-–]\s*(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  
  if (!match) {
    return { start: str, end: '' };
  }

  const [, startH, startM, startPeriod, endH, endM, endPeriod] = match;
  
  let startHour = parseInt(startH, 10);
  let endHour = parseInt(endH, 10);
  
  // Determine the periods
  let endPer = (endPeriod || 'am').toLowerCase();
  let startPer;
  
  // Handle "11:30-12:15am" typo - if end is 12 and marked as AM, it should be PM (noon)
  if (endHour === 12 && endPer === 'am') {
    endPer = 'pm';
  }
  
  if (startPeriod) {
    // Explicit start period - use it
    startPer = startPeriod.toLowerCase();
  } else if (endHour === 12 && endPer === 'pm' && startHour !== 12) {
    // End is noon (12:xx PM), start is in the morning
    // e.g., "11:15-12:15pm" -> 11:15 AM to 12:15 PM
    startPer = 'am';
  } else if (endPer === 'pm' && startHour > endHour) {
    // End is PM but start hour > end hour (and end isn't 12)
    // e.g., "11:30-1:00pm" -> 11:30 AM to 1:00 PM
    startPer = 'am';
  } else {
    // Default: same period as end
    // e.g., "5:30-6:30pm" -> 5:30 PM to 6:30 PM
    startPer = endPer;
  }
  
  return {
    start: `${startH}:${startM} ${startPer}`,
    end: `${endH}:${endM} ${endPer}`
  };
}

/**
 * Smart instructor parsing - detects multiple instructors from any separator format
 * Handles: "JENN W./ ROBERT", "MARI/SHELLEY", "VANESSA STEVE", "ROBERT, JAYME"
 * Returns array of instructor names (canonical/mapped)
 */
function parseInstructors(instructorStr) {
  if (!instructorStr) return [];
  
  let str = instructorStr.toString().trim();
  
  // Remove trailing periods and clean up "/" periods
  str = str.replace(/\.\s*$/, '').replace(/\.\s*\//, '/');
  
  // Step 1: Check for explicit delimiters (/, ,, &, +, "and", "with")
  const delimiterPattern = /[\/,&+]|\s+and\s+|\s+with\s+/i;
  if (delimiterPattern.test(str)) {
    const parts = str.split(delimiterPattern)
      .map(s => s.trim())
      .filter(s => s && s.length > 0);
    
    return parts.map(p => lookupInstructor(p)).filter(p => p);
  }
  
  // Step 2: Smart space detection - check if parts are known instructors
  // Load known instructors cache
  if (!knownInstructorsCache) {
    knownInstructorsCache = getKnownInstructors();
  }
  
  const words = str.split(/\s+/);
  if (words.length >= 2) {
    // Try splitting at each position to find two known instructors
    for (let i = 1; i < words.length; i++) {
      const first = words.slice(0, i).join(' ');
      const second = words.slice(i).join(' ');
      
      const firstLookup = lookupInstructor(first);
      const secondLookup = lookupInstructor(second);
      
      // If BOTH parts are known instructors, split them
      if (knownInstructorsCache.has(firstLookup.toUpperCase()) && 
          knownInstructorsCache.has(secondLookup.toUpperCase())) {
        console.log(`  Smart split: "${str}" -> ["${firstLookup}", "${secondLookup}"]`);
        return [firstLookup, secondLookup];
      }
    }
  }
  
  // Step 3: No split detected - return as single instructor
  const single = lookupInstructor(str);
  return single ? [single] : [];
}

/**
 * Parse location from format like "(SPC)" or "(MB)"
 */
function parseLocation(locStr) {
  if (!locStr) return '';
  const match = locStr.toString().match(/\(([^)]+)\)/);
  if (match) {
    return lookupLocation(match[1]);
  }
  return lookupLocation(locStr.toString().trim());
}

/**
 * Find day sections in the header row
 * Returns array of { day, startCol, dateColumns: [col indices for dates] }
 */
function findDaySections(headerRow) {
  const sections = [];
  let currentSection = null;
  
  for (let col = 0; col < headerRow.length; col++) {
    const cell = headerRow[col];
    const cellStr = cell ? cell.toString().toUpperCase().trim() : '';
    
    if (DAYS.includes(cellStr)) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        day: cellStr,
        startCol: col,
        dateColumns: []
      };
    } else if (currentSection && typeof cell === 'number' && cell > 40000 && cell < 50000) {
      // Excel serial date
      currentSection.dateColumns.push({ col, serial: cell });
    }
  }
  
  if (currentSection) {
    sections.push(currentSection);
  }
  
  return sections;
}

/**
 * Extract session data from a row for a specific day section
 */
function extractSessionFromRow(row, section, yearMonth) {
  const startCol = section.startCol;
  
  // Columns relative to day header:
  // 0: Time range, 1: Class, 2: Location, 3: Instructor, 4+: dates/attendance pairs
  const timeStr = row[startCol];
  const classStr = row[startCol + 1];
  const locStr = row[startCol + 2];
  const instructorStr = row[startCol + 3];
  
  // Skip if no class name (empty row or summary section)
  if (!classStr || classStr.toString().trim() === '') return null;
  
  // Skip summary rows (they don't have time ranges)
  if (!timeStr || !timeStr.toString().includes(':')) return null;
  
  const { start, end } = parseTimeRange(timeStr);
  const className = lookupClass(classStr.toString().trim());
  const location = parseLocation(locStr);
  const instructors = parseInstructors(instructorStr);
  
  // Extract date/attendance pairs
  // Include dates even without attendance (set to null for empty)
  const datePairs = [];
  for (const dateCol of section.dateColumns) {
    const date = excelDateToJS(dateCol.serial);
    // Attendance is in the next column after each date header in the data rows
    // But actually the dates ARE in the header, and the data rows have attendance in those columns
    const attendance = row[dateCol.col];
    
    if (date) {
      // Handle empty attendance - set to null instead of skipping
      if (attendance !== undefined && attendance !== null && attendance !== '') {
        const att = parseInt(attendance, 10);
        if (!isNaN(att)) {
          datePairs.push({
            date: formatDate(date),
            attendance: att
          });
        }
      } else {
        // No attendance recorded - include date with null attendance
        datePairs.push({
          date: formatDate(date),
          attendance: null
        });
      }
    }
  }
  
  // Only return if we have valid class name (allow empty datePairs for templates)
  if (!className) return null;
  // Skip if no dates at all
  if (datePairs.length === 0) return null;
  
  return {
    day: section.day,
    startTime: start,
    endTime: end,
    className,
    location,
    instructors, // Array of instructor names
    datePairs
  };
}

/**
 * Main extraction function
 */
function extractMonth(tabName) {
  const excelPath = path.join(__dirname, '..', 'documents', 'Group X Attendance Tracking.xlsx');
  const wb = XLSX.readFile(excelPath);
  
  if (!wb.SheetNames.includes(tabName)) {
    console.error(`Tab "${tabName}" not found. Available tabs:`, wb.SheetNames);
    process.exit(1);
  }
  
  const yearMonth = TAB_MAPPINGS[tabName];
  if (!yearMonth) {
    console.error(`No year/month mapping for tab "${tabName}"`);
    process.exit(1);
  }
  
  const sheet = wb.Sheets[tabName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  // Dynamically find header row by looking for "SATURDAY" in first column
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (row && row[0] && row[0].toString().toUpperCase() === 'SATURDAY') {
      headerRowIdx = i;
      break;
    }
  }
  
  if (headerRowIdx === -1) {
    console.error(`Could not find header row with SATURDAY in tab "${tabName}"`);
    process.exit(1);
  }
  
  console.log(`Header row found at index ${headerRowIdx}`);
  
  const headerRow = data[headerRowIdx];
  const daySections = findDaySections(headerRow);
  
  console.log(`Found ${daySections.length} day sections:`, daySections.map(s => `${s.day}(${s.dateColumns.length} dates)`).join(', '));
  
  // Extract sessions from data rows (starting at row after header)
  const sessions = [];
  for (let rowIdx = headerRowIdx + 1; rowIdx < data.length; rowIdx++) {
    const row = data[rowIdx];
    if (!row || row.length === 0) continue;
    
    for (const section of daySections) {
      const session = extractSessionFromRow(row, section, yearMonth);
      if (session) {
        sessions.push(session);
      }
    }
  }
  
  console.log(`Extracted ${sessions.length} sessions`);
  
  // Convert to CSV format
  // Instructors column uses pipe separator for multiple instructors: "JENN W|ROBERT"
  const csvRows = ['Day,Start Time,End Time,Class Name,Location,Instructors,Date 1,Attendance 1,Date 2,Attendance 2,Date 3,Attendance 3,Date 4,Attendance 4,Date 5,Attendance 5'];
  
  for (const session of sessions) {
    const row = [
      session.day,
      session.startTime,
      session.endTime,
      session.className,
      session.location,
      session.instructors.join('|') // Pipe-separated instructors
    ];
    
    // Add up to 5 date/attendance pairs
    for (let i = 0; i < 5; i++) {
      if (session.datePairs[i]) {
        row.push(session.datePairs[i].date);
        row.push(session.datePairs[i].attendance);
      } else {
        row.push('');
        row.push('');
      }
    }
    
    csvRows.push(row.join(','));
  }
  
  // Write CSV file
  const outputDir = path.join(__dirname, '..', 'backups', 'csv');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputFile = path.join(outputDir, `${tabName.toLowerCase().replace(/\s+/g, '_')}.csv`);
  fs.writeFileSync(outputFile, csvRows.join('\n'), 'utf8');
  
  console.log(`Written to: ${outputFile}`);
  return { sessions, outputFile };
}

// Run if called directly
if (require.main === module) {
  const tabName = process.argv[2];
  if (!tabName) {
    console.log('Usage: node extract-excel-month.js "Tab Name"');
    console.log('Available tabs to load:', Object.keys(TAB_MAPPINGS).filter(t => 
      ['May 2024', 'JUNE 2024', 'July 2024', 'August 2024', 'Sept 2024', 'Oct 2024', 'Nov 2024', 'Dec 2024',
       'September 2025', 'October 2025', 'November 2025', 'December 2025'].includes(t)
    ).join(', '));
    process.exit(1);
  }
  
  extractMonth(tabName);
}

module.exports = { extractMonth, TAB_MAPPINGS };










