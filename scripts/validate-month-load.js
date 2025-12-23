/**
 * Validate loaded session data against Excel summary reports
 * Usage: node validate-month-load.js "May 2024"
 * 
 * Compares database class averages against Excel summary section
 */

const { Client } = require('pg');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// Schedule name to tab name mapping (reverse of load-month.js)
const TAB_NAMES = {
  'May 2024': 'May 2024',
  'June 2024': 'JUNE 2024',
  'July 2024': 'July 2024',
  'August 2024': 'August 2024',
  'September 2024': 'Sept 2024',
  'October 2024': 'Oct 2024',
  'November 2024': 'Nov 2024',
  'December 2024': 'Dec 2024',
  'September 2025': 'September 2025',
  'October 2025': 'October 2025',
  'November 2025': 'November 2025',
  'December 2025': 'December 2025'
};

/**
 * Extract summary data from Excel tab
 * The summary section is typically rows 40-62, columns D-E
 */
function extractExcelSummary(tabName) {
  const excelPath = path.join(__dirname, '..', 'documents', 'Group X Attendance Tracking.xlsx');
  const wb = XLSX.readFile(excelPath);
  const sheet = wb.Sheets[tabName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  const summary = new Map(); // class name -> average
  
  // Summary section starts around row 35-40 and goes to ~row 62
  // Look for rows that have a class name in column D (index 3) and a number in column E (index 4)
  for (let i = 30; i < Math.min(70, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    
    const className = row[3]; // Column D
    const average = row[4];   // Column E
    
    // Valid summary row has a class name string and a numeric average
    if (className && typeof className === 'string' && className.trim() !== '' &&
        average !== undefined && typeof average === 'number' && !isNaN(average)) {
      
      // Normalize class name for comparison
      const normalizedName = normalizeClassName(className);
      summary.set(normalizedName, average);
    }
  }
  
  return summary;
}

/**
 * Normalize class name for comparison
 * - Uppercase
 * - Remove extra spaces
 * - Handle common variations
 */
function normalizeClassName(name) {
  if (!name) return '';
  let normalized = name.toString().trim().toUpperCase();
  
  // Common mappings between summary names and DB names
  const mappings = {
    'SS CIRCUIT': 'SILVERSNEAKERS® CIRCUIT',
    'SS YOGA': 'SILVERSNEAKERS® YOGA',
    'SILVERSNEAKERS CIRCUIT': 'SILVERSNEAKERS® CIRCUIT',
    'SILVERSNEAKERS YOGA': 'SILVERSNEAKERS® YOGA',
    'SILVERSNEAKERS CLASSIC': 'SILVERSNEAKERS® CLASSIC',
    'SILVERSNEAK CLASSIC': 'SILVERSNEAKERS® CLASSIC',
    'BODYCOMBAT': 'BODYCOMBAT™',
    'BODY COMBAT': 'BODYCOMBAT™',
    'BODYPUMP': 'BODYPUMP™',
    'BODY PUMP': 'BODYPUMP™',
    'BODYBALANCE': 'BODYBALANCE™',
    'BODY BALANCE': 'BODYBALANCE™',
    'LM CORE': 'LES MILLS CORE™',
    'LES MILLS CORE': 'LES MILLS CORE™',
    'RPM': 'LES MILLS RPM™',
    'LES MILLS RPM': 'LES MILLS RPM™',
    'GRIT CARDIO': 'GRIT - CARDIO™',
    'GRIT-CARDIO': 'GRIT - CARDIO™',
    'GRIT STRENGTH': 'GRIT - STRENGTH™',
    'GRIT-STRENGTH': 'GRIT - STRENGTH™',
    'GRIT ATHLETIC': 'GRIT - ATHLETIC™',
    'GRIT-ATHLETIC': 'GRIT - ATHLETIC™',
    'HIGH FITNESS': 'HIGH FITNESS®',
    'AQUA ZUMBA': 'AQUA ZUMBA®',
    'ZUMBA': 'ZUMBA®',
    'ZUMBA GOLD': 'ZUMBA® GOLD',
    'TRX BODY BLAST': 'TRX BODY BLAST®',
    'UPBEAT BARRE': 'UPBEAT BARRE™',
    'UPBEAT PILATES': 'UPBEAT PILATES™',
    'UPBEAT LIFT': 'UPBEAT LIFT™',
    'WERQ': 'WERQ™'
  };
  
  return mappings[normalized] || normalized;
}

/**
 * Get class averages from database
 */
async function getDbAverages(scheduleName) {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  
  try {
    const result = await client.query(`
      SELECT c.name, 
             ROUND(AVG(cs.headcount)::numeric, 2) as avg_attendance,
             COUNT(*) as session_count,
             SUM(cs.headcount) as total_attendance
      FROM class_sessions cs
      JOIN classes c ON c.id = cs.class_id
      JOIN schedules s ON s.id = cs.schedule_id
      WHERE s.name = $1
      GROUP BY c.name
      ORDER BY c.name
    `, [scheduleName]);
    
    const dbData = new Map();
    for (const row of result.rows) {
      dbData.set(row.name.toUpperCase(), {
        name: row.name,
        avg: parseFloat(row.avg_attendance),
        count: parseInt(row.session_count),
        total: parseInt(row.total_attendance)
      });
    }
    
    return dbData;
  } finally {
    await client.end();
  }
}

/**
 * Compare Excel summary with DB averages
 */
function compareAverages(excelSummary, dbData) {
  const results = {
    matches: [],
    mismatches: [],
    excelOnly: [],
    dbOnly: [],
    formulaIssues: []
  };
  
  // Check each Excel entry
  for (const [excelClass, excelAvg] of excelSummary) {
    const dbEntry = dbData.get(excelClass);
    
    if (!dbEntry) {
      // Try to find a close match
      let found = false;
      for (const [dbName, data] of dbData) {
        if (dbName.includes(excelClass) || excelClass.includes(dbName)) {
          // Possible match - compare
          const diff = Math.abs(data.avg - excelAvg);
          if (diff < 0.5) {
            results.matches.push({
              class: excelClass,
              dbName: data.name,
              excelAvg,
              dbAvg: data.avg,
              diff,
              sessions: data.count
            });
          } else {
            results.mismatches.push({
              class: excelClass,
              dbName: data.name,
              excelAvg,
              dbAvg: data.avg,
              diff,
              sessions: data.count,
              note: 'Name partial match'
            });
          }
          found = true;
          break;
        }
      }
      if (!found) {
        results.excelOnly.push({ class: excelClass, excelAvg });
      }
    } else {
      const diff = Math.abs(dbEntry.avg - excelAvg);
      if (diff < 0.5) {
        results.matches.push({
          class: dbEntry.name,
          excelAvg,
          dbAvg: dbEntry.avg,
          diff,
          sessions: dbEntry.count
        });
      } else {
        // Check if this might be a formula issue
        const note = excelAvg === 0 || isNaN(excelAvg) ? 'Possible Excel formula issue (#DIV/0!)' : '';
        results.mismatches.push({
          class: dbEntry.name,
          excelAvg,
          dbAvg: dbEntry.avg,
          diff,
          sessions: dbEntry.count,
          note
        });
        
        if (note) {
          results.formulaIssues.push({
            class: dbEntry.name,
            excelAvg,
            dbAvg: dbEntry.avg,
            issue: 'Excel shows 0 or invalid average'
          });
        }
      }
    }
  }
  
  // Find DB classes not in Excel summary
  for (const [dbName, data] of dbData) {
    let found = false;
    for (const [excelClass] of excelSummary) {
      if (excelClass === dbName || excelClass.includes(dbName) || dbName.includes(excelClass)) {
        found = true;
        break;
      }
    }
    if (!found) {
      results.dbOnly.push({
        class: data.name,
        dbAvg: data.avg,
        sessions: data.count
      });
    }
  }
  
  return results;
}

/**
 * Append validation results to the consolidated status file
 */
function appendToStatusFile(scheduleName, loadResults, validationResults) {
  const statusPath = path.join(__dirname, '..', 'backups', 'session-load-status.md');
  
  // Read existing content
  let content = '';
  if (fs.existsSync(statusPath)) {
    content = fs.readFileSync(statusPath, 'utf8');
  }
  
  // Update summary table - find the table and add a new row
  const summaryRow = `| ${scheduleName} | ${loadResults.totalSessions} | ${loadResults.errors} | ${validationResults.matches.length} | ${validationResults.mismatches.length} | ${validationResults.excelOnly.length} | ${validationResults.dbOnly.length} |`;
  
  // Find the end of the summary table and insert new row
  const tableEndPattern = /(\| [A-Za-z]+ \d{4} \| \d+ \| \d+ \| \d+ \| \d+ \| \d+ \| \d+ \|)\n/g;
  let lastMatch = null;
  let match;
  while ((match = tableEndPattern.exec(content)) !== null) {
    lastMatch = match;
  }
  
  if (lastMatch) {
    const insertPos = lastMatch.index + lastMatch[0].length;
    content = content.slice(0, insertPos) + summaryRow + '\n' + content.slice(insertPos);
  }
  
  // Build detailed section
  let detailSection = `
### ${scheduleName}

**Load Results:**
- Sessions inserted: ${loadResults.inserted}
- Sessions updated: ${loadResults.updated}
- Errors: ${loadResults.errors}
- Total sessions: ${loadResults.totalSessions}
- Unique dates: ${loadResults.totalDates}

**Validation Results:**
- Matches (within 0.5): ${validationResults.matches.length}
- Mismatches: ${validationResults.mismatches.length}
- Excel only: ${validationResults.excelOnly.length}
- DB only: ${validationResults.dbOnly.length}

`;

  if (validationResults.mismatches.length > 0) {
    detailSection += `**Mismatches:**

| Class | Excel Avg | DB Avg | Diff | Sessions |
|-------|-----------|--------|------|----------|
`;
    for (const m of validationResults.mismatches) {
      detailSection += `| ${m.class} | ${m.excelAvg.toFixed(2)} | ${m.dbAvg.toFixed(2)} | ${m.diff.toFixed(2)} | ${m.sessions} |\n`;
    }
    detailSection += '\n';
  }

  if (validationResults.dbOnly.length > 0) {
    detailSection += `**DB Only (not in Excel summary):**\n`;
    for (const d of validationResults.dbOnly) {
      detailSection += `- ${d.class}: avg=${d.dbAvg.toFixed(2)}, sessions=${d.sessions}\n`;
    }
    detailSection += '\n';
  }

  if (validationResults.excelOnly.length > 0) {
    detailSection += `**Excel Only (not in DB):**\n`;
    for (const e of validationResults.excelOnly) {
      detailSection += `- ${e.class}: avg=${e.excelAvg.toFixed(2)}\n`;
    }
    detailSection += '\n';
  }

  detailSection += `---\n`;

  // Append detail section to end of file
  content += detailSection;
  
  fs.writeFileSync(statusPath, content, 'utf8');
  console.log(`\nStatus file updated: ${statusPath}`);
}

async function validateMonth(scheduleName, loadResults = null) {
  const tabName = TAB_NAMES[scheduleName];
  if (!tabName) {
    console.error(`Unknown schedule: ${scheduleName}`);
    console.log('Available schedules:', Object.keys(TAB_NAMES).join(', '));
    process.exit(1);
  }
  
  console.log(`\n=== Validating ${scheduleName} ===\n`);
  
  // Get Excel summary
  console.log('Extracting Excel summary...');
  const excelSummary = extractExcelSummary(tabName);
  console.log(`Found ${excelSummary.size} classes in Excel summary`);
  
  // Get DB averages
  console.log('Querying database...');
  const dbData = await getDbAverages(scheduleName);
  console.log(`Found ${dbData.size} classes in database`);
  
  // Compare
  console.log('\nComparing...\n');
  const results = compareAverages(excelSummary, dbData);
  
  // Report results
  console.log('=== VALIDATION RESULTS ===\n');
  
  console.log(`✓ Matches (within 0.5): ${results.matches.length}`);
  console.log(`✗ Mismatches: ${results.mismatches.length}`);
  console.log(`? Excel only (not in DB): ${results.excelOnly.length}`);
  console.log(`? DB only (not in Excel summary): ${results.dbOnly.length}`);
  
  if (results.mismatches.length > 0) {
    console.log('\n--- MISMATCHES ---');
    for (const m of results.mismatches) {
      console.log(`  ${m.class}: Excel=${m.excelAvg.toFixed(2)}, DB=${m.dbAvg.toFixed(2)} (diff=${m.diff.toFixed(2)}, sessions=${m.sessions}) ${m.note || ''}`);
    }
  }
  
  if (results.excelOnly.length > 0) {
    console.log('\n--- EXCEL ONLY (not matched in DB) ---');
    for (const e of results.excelOnly) {
      console.log(`  ${e.class}: avg=${e.excelAvg.toFixed(2)}`);
    }
  }
  
  if (results.dbOnly.length > 0) {
    console.log('\n--- DB ONLY (not in Excel summary) ---');
    for (const d of results.dbOnly) {
      console.log(`  ${d.class}: avg=${d.dbAvg.toFixed(2)}, sessions=${d.sessions}`);
    }
  }
  
  if (results.formulaIssues.length > 0) {
    console.log('\n--- POSSIBLE EXCEL FORMULA ISSUES ---');
    for (const f of results.formulaIssues) {
      console.log(`  ${f.class}: ${f.issue}`);
    }
  }
  
  // Write detailed results to file
  const outputDir = path.join(__dirname, '..', 'backups', 'validation');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputFile = path.join(outputDir, `${scheduleName.toLowerCase().replace(/\s+/g, '_')}_validation.json`);
  fs.writeFileSync(outputFile, JSON.stringify({
    schedule: scheduleName,
    timestamp: new Date().toISOString(),
    excelClassCount: excelSummary.size,
    dbClassCount: dbData.size,
    summary: {
      matches: results.matches.length,
      mismatches: results.mismatches.length,
      excelOnly: results.excelOnly.length,
      dbOnly: results.dbOnly.length
    },
    details: results
  }, null, 2), 'utf8');
  
  console.log(`\nDetailed results written to: ${outputFile}`);
  
  // Append to consolidated status file if load results provided
  if (loadResults) {
    appendToStatusFile(scheduleName, loadResults, results);
  }
  
  return results;
}

// Run if called directly
if (require.main === module) {
  const scheduleName = process.argv[2];
  if (!scheduleName) {
    console.log('Usage: node validate-month-load.js "Schedule Name"');
    console.log('Available schedules:', Object.keys(TAB_NAMES).join(', '));
    process.exit(1);
  }
  
  validateMonth(scheduleName)
    .then(() => {
      console.log('\n=== VALIDATION COMPLETE ===');
    })
    .catch(err => {
      console.error('Validation failed:', err);
      process.exit(1);
    });
}

module.exports = { validateMonth, appendToStatusFile };













