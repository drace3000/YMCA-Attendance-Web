/**
 * Mapping utilities for loading session data
 * Loads excel_db_comparison_utf8.csv and provides lookup functions
 * Value -> MAPSTO transformations for classes, instructors, locations
 */

const fs = require('fs');
const path = require('path');

// Cache for mappings
let mappings = null;

/**
 * Load and parse the mapping CSV file
 * @returns {Object} Mappings organized by type
 */
function loadMappings() {
  if (mappings) return mappings;

  const csvPath = path.join(__dirname, '..', 'backups', 'excel_db_comparison_utf8.csv');
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.trim().split('\n');
  
  mappings = {
    CLASS: new Map(),
    INSTRUCTOR: new Map(),
    LOCATION: new Map()
  };

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV (simple - no quoted fields with commas)
    const [type, value, mapsto] = line.split(',').map(s => s.trim());
    
    if (type && value && mapsto && mappings[type]) {
      // Store with uppercase key for case-insensitive lookup
      mappings[type].set(value.toUpperCase(), mapsto);
    }
  }

  console.log(`Loaded mappings: ${mappings.CLASS.size} classes, ${mappings.INSTRUCTOR.size} instructors, ${mappings.LOCATION.size} locations`);
  return mappings;
}

/**
 * Lookup a value and return the canonical (MAPSTO) name
 * @param {string} type - 'CLASS', 'INSTRUCTOR', or 'LOCATION'
 * @param {string} value - The value from Excel
 * @returns {string} The canonical name (MAPSTO value or original if not found)
 */
function lookup(type, value) {
  if (!value) return value;
  
  const m = loadMappings();
  const typeMap = m[type.toUpperCase()];
  
  if (!typeMap) {
    console.warn(`Unknown mapping type: ${type}`);
    return value;
  }

  // Clean the value
  let cleaned = value.trim();
  
  // For instructors, remove trailing periods (e.g., "JENN W." -> "JENN W")
  if (type.toUpperCase() === 'INSTRUCTOR') {
    cleaned = cleaned.replace(/\.$/, '').trim();
  }

  // Lookup with uppercase key
  const mapped = typeMap.get(cleaned.toUpperCase());
  
  if (mapped) {
    return mapped;
  }
  
  // Not in mapping file - return cleaned original (uppercase for consistency)
  return cleaned.toUpperCase();
}

/**
 * Lookup a class name
 * @param {string} className - The class name from Excel
 * @returns {string} The canonical class name
 */
function lookupClass(className) {
  return lookup('CLASS', className);
}

/**
 * Lookup an instructor name
 * @param {string} instructorName - The instructor name from Excel
 * @returns {string} The canonical instructor name
 */
function lookupInstructor(instructorName) {
  return lookup('INSTRUCTOR', instructorName);
}

/**
 * Lookup a location code
 * @param {string} locationCode - The location code from Excel
 * @returns {string} The canonical location code
 */
function lookupLocation(locationCode) {
  return lookup('LOCATION', locationCode);
}

/**
 * Get all mappings for a specific type
 * @param {string} type - 'CLASS', 'INSTRUCTOR', or 'LOCATION'
 * @returns {Map} The mapping Map for the type
 */
function getMappings(type) {
  const m = loadMappings();
  return m[type.toUpperCase()] || new Map();
}

/**
 * Get a Set of all known instructor names (canonical names)
 * This includes both MAPSTO values and any instructors already in the lookup keys
 * Used for smart detection of multiple instructors in a single string
 * @returns {Set<string>} Set of known instructor names (uppercase)
 */
function getKnownInstructors() {
  const m = loadMappings();
  const known = new Set();
  
  // Add all MAPSTO values (canonical names) from the mapping file
  for (const [key, mapsto] of m.INSTRUCTOR) {
    known.add(mapsto.toUpperCase());
    // Also add the key in case it's already canonical
    known.add(key.toUpperCase());
  }
  
  return known;
}

module.exports = {
  loadMappings,
  lookup,
  lookupClass,
  lookupInstructor,
  lookupLocation,
  getMappings,
  getKnownInstructors
};
















