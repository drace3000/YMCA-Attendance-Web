const XLSX = require('../web/node_modules/xlsx');
const fs = require('fs');
const path = require('path');

// Read the Excel file
const excelPath = path.join(__dirname, '..', 'documents', 'Group X Attendance Tracking.xlsx');
console.log('Reading:', excelPath);

const workbook = XLSX.readFile(excelPath);

// Collections for unique values
const classNames = new Set();
const instructors = new Set();
const locations = new Set();

// Month sheets to process (2025 data)
const monthSheets = workbook.SheetNames.filter(name => 
    name.includes('2025') && 
    !name.includes('Template') && 
    !name.includes('Instructor')
);

console.log('\nProcessing sheets:', monthSheets.join(', '));

monthSheets.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    let classCount = 0;
    
    // The structure is: each row from row 4 onwards has data
    // Format: Time | Class Name | Location (in parens) | Instructor | ... repeated for each day
    // Each "day block" is about 11 columns wide
    
    // Process rows starting from row 4 (index 4)
    for (let rowIdx = 4; rowIdx < data.length; rowIdx++) {
        const row = data[rowIdx];
        if (!row || row.length === 0) continue;
        
        // Process each "day block" - approximately every 11 columns
        // Column pattern: Time, Class, Location, Instructor, Date1, Date2, Date3, Date4, null, Total, Avg
        for (let col = 0; col < row.length; col++) {
            const cell = row[col];
            if (!cell) continue;
            
            const cellStr = String(cell).trim();
            
            // Check if this looks like a class name (not a time, not a number, not a day name)
            // Class names are typically uppercase with possible ™ or ® symbols
            if (cellStr.length > 2 && 
                !cellStr.match(/^\d/) && // doesn't start with digit
                !cellStr.match(/^[0-9:]+[ap]m$/i) && // not a time
                !cellStr.match(/^\d+(\.\d+)?$/) && // not a number
                !['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'Totals', 'Total', 'Avg', 'Average'].includes(cellStr) &&
                !cellStr.startsWith('(') && // not a location in parens
                cellStr === cellStr.toUpperCase() && // all caps (class names)
                cellStr.length < 30) { // reasonable length
                
                // Check if next column looks like a location (starts with parenthesis)
                const nextCell = row[col + 1];
                if (nextCell && String(nextCell).trim().startsWith('(')) {
                    // This is likely a class name
                    classNames.add(cellStr);
                    classCount++;
                    
                    // Get location (remove parentheses)
                    const locStr = String(nextCell).trim().replace(/[()]/g, '');
                    if (locStr) locations.add(locStr);
                    
                    // Get instructor (next column after location)
                    const instCell = row[col + 2];
                    if (instCell) {
                        const instStr = String(instCell).trim();
                        // Handle multiple instructors separated by / or &
                        if (instStr.includes('/')) {
                            instStr.split('/').forEach(i => {
                                const cleaned = i.trim().replace(/\.$/, ''); // remove trailing period
                                if (cleaned) instructors.add(cleaned);
                            });
                        } else {
                            const cleaned = instStr.replace(/\.$/, ''); // remove trailing period
                            if (cleaned && !cleaned.match(/^\d/)) instructors.add(cleaned);
                        }
                    }
                }
            }
        }
    }
    
    console.log(`  ${sheetName}: ${classCount} class entries found`);
});

// Output results
console.log('\n=== UNIQUE VALUES ===');
console.log(`\nClasses (${classNames.size}):`);
[...classNames].sort().forEach(c => console.log(`  ${c}`));

console.log(`\nInstructors (${instructors.size}):`);
[...instructors].sort().forEach(i => console.log(`  ${i}`));

console.log(`\nLocations (${locations.size}):`);
[...locations].sort().forEach(l => console.log(`  ${l}`));

// Save to JSON for further processing
const output = {
    classes: [...classNames].sort(),
    instructors: [...instructors].sort(),
    locations: [...locations].sort()
};

fs.writeFileSync(
    path.join(__dirname, '..', 'backups', 'excel_unique_values.json'),
    JSON.stringify(output, null, 2)
);

console.log('\nSaved to backups/excel_unique_values.json');
