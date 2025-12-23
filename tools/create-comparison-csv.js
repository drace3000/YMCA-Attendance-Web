const fs = require('fs');
const path = require('path');

// Read extracted values from Excel
const excelData = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'backups', 'excel_unique_values.json'), 
    'utf8'
));

// Read database values
const dbClasses = fs.readFileSync(
    path.join(__dirname, '..', 'backups', 'db_classes.txt'), 
    'utf8'
).split('\n').filter(x => x.trim()).map(x => x.trim());

const dbInstructors = fs.readFileSync(
    path.join(__dirname, '..', 'backups', 'db_instructors.txt'), 
    'utf8'
).split('\n').filter(x => x.trim()).map(x => x.trim());

const dbLocations = fs.readFileSync(
    path.join(__dirname, '..', 'backups', 'db_locations.txt'), 
    'utf8'
).split('\n').filter(x => x.trim()).map(x => x.trim());

console.log('DB Classes:', dbClasses.length);
console.log('DB Instructors:', dbInstructors.length);
console.log('DB Locations:', dbLocations.length);

// Create comparison
const rows = [];
rows.push('Type,Value,DB_Match');

// Classes
excelData.classes.sort().forEach(name => {
    const match = dbClasses.includes(name) ? 'YES' : 'NO';
    // Escape commas and quotes in value
    const escapedName = name.includes(',') || name.includes('"') 
        ? `"${name.replace(/"/g, '""')}"` 
        : name;
    rows.push(`CLASS,${escapedName},${match}`);
});

// Instructors
excelData.instructors.sort().forEach(name => {
    const match = dbInstructors.includes(name) ? 'YES' : 'NO';
    const escapedName = name.includes(',') || name.includes('"') 
        ? `"${name.replace(/"/g, '""')}"` 
        : name;
    rows.push(`INSTRUCTOR,${escapedName},${match}`);
});

// Locations
excelData.locations.sort().forEach(name => {
    const match = dbLocations.includes(name) ? 'YES' : 'NO';
    const escapedName = name.includes(',') || name.includes('"') 
        ? `"${name.replace(/"/g, '""')}"` 
        : name;
    rows.push(`LOCATION,${escapedName},${match}`);
});

// Write DOS CSV (CRLF line endings)
const csvContent = rows.join('\r\n') + '\r\n';
fs.writeFileSync(
    path.join(__dirname, '..', 'backups', 'excel_db_comparison.csv'),
    csvContent,
    'ascii'
);

console.log(`\nExported ${rows.length - 1} rows to backups/excel_db_comparison.csv`);

// Summary
const classMatches = excelData.classes.filter(c => dbClasses.includes(c)).length;
const instMatches = excelData.instructors.filter(i => dbInstructors.includes(i)).length;
const locMatches = excelData.locations.filter(l => dbLocations.includes(l)).length;

console.log('\nSummary:');
console.log(`  Classes: ${classMatches}/${excelData.classes.length} match`);
console.log(`  Instructors: ${instMatches}/${excelData.instructors.length} match`);
console.log(`  Locations: ${locMatches}/${excelData.locations.length} match`);




















