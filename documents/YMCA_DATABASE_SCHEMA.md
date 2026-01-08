# YMCA Organization Database Schema

## Overview

This document provides the complete database schema and seed data for implementing YMCA organizational hierarchy support in a Supabase database. It is designed for the **YMCA of Greater Rochester Branch Management System** with future multi-tenant expansion capability.

---

## Part 1: YMCA Organizational Structure

### National Structure

The YMCA of the USA operates on a **federated model**:

- **YMCA of the USA** (National): Headquartered in Chicago, provides resources and standards
- **State/Regional Alliances** (29 total): Coordinate advocacy, training, and shared services
- **Associations** (~2,600): Independent 501(c)(3) nonprofits serving local communities
- **Branches** (~10,000): Physical locations operated by associations

Each level is independent - alliances don't control associations, they support them.

### Alliance Structure

There are **29 State and Regional Alliances** in the US (including Puerto Rico):
- **17 State Alliances**: Single-state coverage (e.g., California, Texas, New York)
- **12 Regional Alliances**: Multi-state coverage (e.g., Northern New England covers ME, NH, VT)

### Greater Rochester Hierarchy

```
Alliance of New York State YMCAs (code: NY)
    └── YMCA of Greater Rochester (code: GROC)
            ├── Bay View Family YMCA (code: BAYVIEW) - Webster
            ├── Corning Family YMCA (code: CORNING) - Corning
            ├── Eastside Family YMCA (code: EASTSIDE) - Penfield
            ├── Maplewood Family YMCA (code: MAPLEWOOD) - Rochester
            ├── Northwest Family YMCA (code: NORTHWEST) - Rochester
            ├── Sands Family YMCA (code: SANDS) - Canandaigua
            ├── Schottland Family YMCA (code: SCHOTTLAND) - Pittsford
            ├── Lewis Street YMCA Neighborhood Center (code: LEWIS) - Rochester
            ├── Thurston Road YMCA Neighborhood Center (code: THURSTON) - Rochester
            ├── The Y at Watson Woods (code: WATSONWOODS) - Painted Post
            ├── The YMCA at Innovation Square (code: INNOVSQ) - Rochester
            └── Westside Family YMCA (code: WESTSIDE) - Rochester
```

---

## Part 2: Database Schema

### ERD Overview

```
us_states (52 records)
    │
    ├──< ymca_alliance_states >── ymca_alliances (29 records)
    │                                    │
    │                                    │
    └─────────────────────────── ymca_associations (1 record: GROC)
                                         │
                                         │
                                  ymca_branches (12 records)
```

### SQL Schema

```sql
-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE ymca_alliance_type AS ENUM ('state', 'regional');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- TABLES
-- ============================================================================

-- US States and Territories
CREATE TABLE IF NOT EXISTS us_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code CHAR(2) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    is_territory BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- YMCA Alliances (State and Regional)
CREATE TABLE IF NOT EXISTS ymca_alliances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    short_name VARCHAR(100),
    alliance_type ymca_alliance_type NOT NULL,
    website_url VARCHAR(500),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    headquarters_city VARCHAR(100),
    headquarters_state_code CHAR(2) REFERENCES us_states(code),
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alliance to State mapping (junction table)
CREATE TABLE IF NOT EXISTS ymca_alliance_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alliance_id UUID NOT NULL REFERENCES ymca_alliances(id) ON DELETE CASCADE,
    state_code CHAR(2) NOT NULL REFERENCES us_states(code) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_state_alliance UNIQUE (state_code)
);

-- YMCA Associations (Independent nonprofits)
CREATE TABLE IF NOT EXISTS ymca_associations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    short_name VARCHAR(100),
    alliance_id UUID REFERENCES ymca_alliances(id),
    state_code CHAR(2) NOT NULL REFERENCES us_states(code),
    website_url VARCHAR(500),
    main_phone VARCHAR(50),
    main_email VARCHAR(255),
    hq_address_line1 VARCHAR(200),
    hq_address_line2 VARCHAR(200),
    hq_city VARCHAR(100),
    hq_state_code CHAR(2) REFERENCES us_states(code),
    hq_postal_code VARCHAR(20),
    ein VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    subscription_tier VARCHAR(50),
    subscription_status VARCHAR(50) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- YMCA Branches (Physical locations)
CREATE TABLE IF NOT EXISTS ymca_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    short_name VARCHAR(100),
    association_id UUID NOT NULL REFERENCES ymca_associations(id) ON DELETE CASCADE,
    address_line1 VARCHAR(200),
    address_line2 VARCHAR(200),
    city VARCHAR(100),
    state_code CHAR(2) REFERENCES us_states(code),
    postal_code VARCHAR(20),
    county VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    timezone VARCHAR(50) DEFAULT 'America/New_York',
    phone VARCHAR(50),
    email VARCHAR(255),
    website_url VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    is_main_branch BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_branch_code_per_association UNIQUE (association_id, code)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_alliance_states_alliance ON ymca_alliance_states(alliance_id);
CREATE INDEX IF NOT EXISTS idx_alliance_states_state ON ymca_alliance_states(state_code);
CREATE INDEX IF NOT EXISTS idx_alliances_type ON ymca_alliances(alliance_type);
CREATE INDEX IF NOT EXISTS idx_alliances_active ON ymca_alliances(is_active);
CREATE INDEX IF NOT EXISTS idx_associations_alliance ON ymca_associations(alliance_id);
CREATE INDEX IF NOT EXISTS idx_associations_state ON ymca_associations(state_code);
CREATE INDEX IF NOT EXISTS idx_associations_active ON ymca_associations(is_active);
CREATE INDEX IF NOT EXISTS idx_branches_association ON ymca_branches(association_id);
CREATE INDEX IF NOT EXISTS idx_branches_state ON ymca_branches(state_code);
CREATE INDEX IF NOT EXISTS idx_branches_active ON ymca_branches(is_active);
```

---

## Part 3: Seed Data

### US States (52 records)

```sql
INSERT INTO us_states (code, name, is_territory) VALUES
    ('AL', 'Alabama', FALSE),
    ('AK', 'Alaska', FALSE),
    ('AZ', 'Arizona', FALSE),
    ('AR', 'Arkansas', FALSE),
    ('CA', 'California', FALSE),
    ('CO', 'Colorado', FALSE),
    ('CT', 'Connecticut', FALSE),
    ('DE', 'Delaware', FALSE),
    ('DC', 'District of Columbia', TRUE),
    ('FL', 'Florida', FALSE),
    ('GA', 'Georgia', FALSE),
    ('HI', 'Hawaii', FALSE),
    ('ID', 'Idaho', FALSE),
    ('IL', 'Illinois', FALSE),
    ('IN', 'Indiana', FALSE),
    ('IA', 'Iowa', FALSE),
    ('KS', 'Kansas', FALSE),
    ('KY', 'Kentucky', FALSE),
    ('LA', 'Louisiana', FALSE),
    ('ME', 'Maine', FALSE),
    ('MD', 'Maryland', FALSE),
    ('MA', 'Massachusetts', FALSE),
    ('MI', 'Michigan', FALSE),
    ('MN', 'Minnesota', FALSE),
    ('MS', 'Mississippi', FALSE),
    ('MO', 'Missouri', FALSE),
    ('MT', 'Montana', FALSE),
    ('NE', 'Nebraska', FALSE),
    ('NV', 'Nevada', FALSE),
    ('NH', 'New Hampshire', FALSE),
    ('NJ', 'New Jersey', FALSE),
    ('NM', 'New Mexico', FALSE),
    ('NY', 'New York', FALSE),
    ('NC', 'North Carolina', FALSE),
    ('ND', 'North Dakota', FALSE),
    ('OH', 'Ohio', FALSE),
    ('OK', 'Oklahoma', FALSE),
    ('OR', 'Oregon', FALSE),
    ('PA', 'Pennsylvania', FALSE),
    ('PR', 'Puerto Rico', TRUE),
    ('RI', 'Rhode Island', FALSE),
    ('SC', 'South Carolina', FALSE),
    ('SD', 'South Dakota', FALSE),
    ('TN', 'Tennessee', FALSE),
    ('TX', 'Texas', FALSE),
    ('UT', 'Utah', FALSE),
    ('VT', 'Vermont', FALSE),
    ('VA', 'Virginia', FALSE),
    ('WA', 'Washington', FALSE),
    ('WV', 'West Virginia', FALSE),
    ('WI', 'Wisconsin', FALSE),
    ('WY', 'Wyoming', FALSE)
ON CONFLICT (code) DO NOTHING;
```

### YMCA Alliances (29 records)

```sql
-- STATE ALLIANCES (17)
INSERT INTO ymca_alliances (code, name, short_name, alliance_type, website_url, headquarters_state_code, notes) VALUES
    ('CA', 'California State Alliance of YMCAs', 'California Alliance', 'state', 'https://www.ymcasofca.org/', 'CA', '33 independent YMCAs + 3 Armed Services YMCAs'),
    ('TX', 'Texas State Alliance of YMCAs', 'Texas Alliance', 'state', 'https://texasallianceymcas.org/', 'TX', 'Over 700 facilities'),
    ('FL', 'Florida State Alliance of YMCAs', 'Florida Alliance', 'state', 'https://www.floridaymcas.org/', 'FL', '1 in 18 Florida residents involved'),
    ('OH', 'Ohio Alliance of YMCAs', 'Ohio Alliance', 'state', 'https://www.ohioymcas.org/', 'OH', '163 YMCAs serving 800K+ families'),
    ('PA', 'Pennsylvania State Alliance of YMCAs', 'Pennsylvania Alliance', 'state', 'https://psays.com/', 'PA', '58 associations, 108 branches'),
    ('NY', 'Alliance of New York State YMCAs', 'New York Alliance', 'state', 'http://www.ymcanys.org/', 'NY', '38 independent YMCAs, 135+ branches'),
    ('NJ', 'New Jersey YMCA State Alliance', 'New Jersey Alliance', 'state', 'https://www.njymca.org/', 'NJ', NULL),
    ('IN', 'Indiana Alliance of YMCAs', 'Indiana Alliance', 'state', 'https://www.indianaymcas.org/', 'IN', NULL),
    ('MO', 'Missouri State Alliance of YMCAs', 'Missouri Alliance', 'state', 'https://moymca.org/', 'MO', '24 YMCAs'),
    ('VA', 'Virginia Alliance of YMCAs', 'Virginia Alliance', 'state', 'https://virginiaymcaalliance.org/', 'VA', NULL),
    ('WA', 'Washington State Alliance of YMCAs', 'Washington Alliance', 'state', 'https://www.seattleymca.org/washington-ymcas/', 'WA', '15 YMCAs, 50 branches, 8 camps'),
    ('AZ', 'Alliance of Arizona YMCAs', 'Arizona Alliance', 'state', 'https://azymcas.org/', 'AZ', NULL),
    ('GA', 'State YMCA of Georgia', 'Georgia Alliance', 'state', NULL, 'GA', 'Founded 1919'),
    ('IL', 'Illinois State Alliance of YMCAs', 'Illinois Alliance', 'state', NULL, 'IL', NULL),
    ('MI', 'Michigan Alliance of YMCAs', 'Michigan Alliance', 'state', NULL, 'MI', NULL),
    ('NC', 'North Carolina Alliance of YMCAs', 'North Carolina Alliance', 'state', NULL, 'NC', NULL),
    ('TN', 'Tennessee Alliance of YMCAs', 'Tennessee Alliance', 'state', NULL, 'TN', NULL)
ON CONFLICT (code) DO NOTHING;

-- REGIONAL ALLIANCES (12)
INSERT INTO ymca_alliances (code, name, short_name, alliance_type, website_url, headquarters_state_code, notes) VALUES
    ('NNE', 'YMCA Alliance of Northern New England', 'Northern New England', 'regional', 'https://nneymcas.org/', 'ME', 'ME, NH, VT - 25 YMCAs'),
    ('UMW', 'Upper Midwest Alliance of YMCAs', 'Upper Midwest', 'regional', 'https://www.uppermidwestymcas.org/', 'WI', 'WI, MN'),
    ('PAC', 'Pacific Alliance of YMCAs', 'Pacific Alliance', 'regional', NULL, 'WA', 'OR, AK, ID'),
    ('KYWY', 'Kentucky & West Virginia Alliance of YMCAs', 'KY-WV Alliance', 'regional', NULL, 'KY', NULL),
    ('MAR', 'Massachusetts Alliance of YMCAs', 'Massachusetts', 'regional', NULL, 'MA', NULL),
    ('SNE', 'Southern New England Alliance of YMCAs', 'Southern New England', 'regional', NULL, 'CT', 'CT, RI'),
    ('TRI', 'YMCA of the Triangle', 'Triangle', 'regional', 'https://www.ymcatriangle.org/', 'NC', 'NC Triangle region'),
    ('GWR', 'Gateway Region YMCA', 'Gateway Region', 'regional', 'https://gwrymca.org/', 'MO', 'St. Louis metro'),
    ('RMT', 'Rocky Mountain Alliance of YMCAs', 'Rocky Mountain', 'regional', NULL, 'CO', 'CO, WY, MT'),
    ('SWA', 'Southwest Alliance of YMCAs', 'Southwest', 'regional', NULL, 'NM', NULL),
    ('SEA', 'Southeast Alliance of YMCAs', 'Southeast', 'regional', NULL, 'AL', 'AL, MS, LA'),
    ('PRA', 'Puerto Rico YMCA Alliance', 'Puerto Rico', 'regional', NULL, 'PR', NULL)
ON CONFLICT (code) DO NOTHING;
```

### Alliance to State Mappings

```sql
-- State alliances (1:1)
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'CA', TRUE FROM ymca_alliances WHERE code = 'CA' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'TX', TRUE FROM ymca_alliances WHERE code = 'TX' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'FL', TRUE FROM ymca_alliances WHERE code = 'FL' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'OH', TRUE FROM ymca_alliances WHERE code = 'OH' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'PA', TRUE FROM ymca_alliances WHERE code = 'PA' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'NY', TRUE FROM ymca_alliances WHERE code = 'NY' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'NJ', TRUE FROM ymca_alliances WHERE code = 'NJ' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'IN', TRUE FROM ymca_alliances WHERE code = 'IN' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'MO', TRUE FROM ymca_alliances WHERE code = 'MO' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'VA', TRUE FROM ymca_alliances WHERE code = 'VA' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'AZ', TRUE FROM ymca_alliances WHERE code = 'AZ' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'GA', TRUE FROM ymca_alliances WHERE code = 'GA' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'IL', TRUE FROM ymca_alliances WHERE code = 'IL' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'MI', TRUE FROM ymca_alliances WHERE code = 'MI' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'TN', TRUE FROM ymca_alliances WHERE code = 'TN' ON CONFLICT DO NOTHING;

-- Regional alliances (multi-state)
-- Northern New England: ME, NH, VT
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'ME', TRUE FROM ymca_alliances WHERE code = 'NNE' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'NH', FALSE FROM ymca_alliances WHERE code = 'NNE' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'VT', FALSE FROM ymca_alliances WHERE code = 'NNE' ON CONFLICT DO NOTHING;

-- Upper Midwest: WI, MN
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'WI', TRUE FROM ymca_alliances WHERE code = 'UMW' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'MN', FALSE FROM ymca_alliances WHERE code = 'UMW' ON CONFLICT DO NOTHING;

-- Pacific: OR, AK, ID (WA has own state alliance)
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'OR', TRUE FROM ymca_alliances WHERE code = 'PAC' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'AK', FALSE FROM ymca_alliances WHERE code = 'PAC' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'ID', FALSE FROM ymca_alliances WHERE code = 'PAC' ON CONFLICT DO NOTHING;

-- Kentucky & West Virginia
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'KY', TRUE FROM ymca_alliances WHERE code = 'KYWY' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'WV', FALSE FROM ymca_alliances WHERE code = 'KYWY' ON CONFLICT DO NOTHING;

-- Massachusetts
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'MA', TRUE FROM ymca_alliances WHERE code = 'MAR' ON CONFLICT DO NOTHING;

-- Southern New England: CT, RI
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'CT', TRUE FROM ymca_alliances WHERE code = 'SNE' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'RI', FALSE FROM ymca_alliances WHERE code = 'SNE' ON CONFLICT DO NOTHING;

-- Rocky Mountain: CO, WY, MT
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'CO', TRUE FROM ymca_alliances WHERE code = 'RMT' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'WY', FALSE FROM ymca_alliances WHERE code = 'RMT' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'MT', FALSE FROM ymca_alliances WHERE code = 'RMT' ON CONFLICT DO NOTHING;

-- Southwest: NM
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'NM', TRUE FROM ymca_alliances WHERE code = 'SWA' ON CONFLICT DO NOTHING;

-- Southeast: AL, MS, LA
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'AL', TRUE FROM ymca_alliances WHERE code = 'SEA' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'MS', FALSE FROM ymca_alliances WHERE code = 'SEA' ON CONFLICT DO NOTHING;
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'LA', FALSE FROM ymca_alliances WHERE code = 'SEA' ON CONFLICT DO NOTHING;

-- Puerto Rico
INSERT INTO ymca_alliance_states (alliance_id, state_code, is_primary)
SELECT id, 'PR', TRUE FROM ymca_alliances WHERE code = 'PRA' ON CONFLICT DO NOTHING;
```

### YMCA of Greater Rochester Association

```sql
INSERT INTO ymca_associations (
    code, 
    name, 
    short_name, 
    alliance_id, 
    state_code,
    website_url,
    main_phone,
    hq_address_line1,
    hq_city,
    hq_state_code,
    hq_postal_code,
    is_active,
    subscription_tier,
    notes
)
SELECT 
    'GROC',
    'YMCA of Greater Rochester',
    'Greater Rochester Y',
    (SELECT id FROM ymca_alliances WHERE code = 'NY'),
    'NY',
    'https://rochesterymca.org/',
    '585-546-5500',
    '100 Chestnut Street, Suite 901',
    'Rochester',
    'NY',
    '14604',
    TRUE,
    'professional',
    'Initial implementation association - 12 branches'
ON CONFLICT (code) DO NOTHING;
```

### Greater Rochester Branches (12 records)

```sql
-- 1. Bay View Family YMCA
INSERT INTO ymca_branches (
    code, name, short_name, association_id,
    address_line1, city, state_code, postal_code,
    phone, timezone, is_active
) SELECT 
    'BAYVIEW', 'Bay View Family YMCA', 'Bay View Y',
    id, '1209 Bay Road', 'Webster', 'NY', '14580',
    '585-671-8414', 'America/New_York', TRUE
FROM ymca_associations WHERE code = 'GROC'
ON CONFLICT (association_id, code) DO NOTHING;

-- 2. Corning Family YMCA
INSERT INTO ymca_branches (
    code, name, short_name, association_id,
    address_line1, city, state_code, postal_code,
    phone, timezone, is_active
) SELECT 
    'CORNING', 'Corning Family YMCA', 'Corning Y',
    id, '127 Center Way', 'Corning', 'NY', '14830',
    '607-936-4638', 'America/New_York', TRUE
FROM ymca_associations WHERE code = 'GROC'
ON CONFLICT (association_id, code) DO NOTHING;

-- 3. Eastside Family YMCA
INSERT INTO ymca_branches (
    code, name, short_name, association_id,
    address_line1, city, state_code, postal_code,
    phone, timezone, is_active
) SELECT 
    'EASTSIDE', 'Eastside Family YMCA', 'Eastside Y',
    id, '1835 Fairport Nine Mile Point Road', 'Penfield', 'NY', '14526',
    '585-341-4000', 'America/New_York', TRUE
FROM ymca_associations WHERE code = 'GROC'
ON CONFLICT (association_id, code) DO NOTHING;

-- 4. Maplewood Family YMCA
INSERT INTO ymca_branches (
    code, name, short_name, association_id,
    address_line1, city, state_code, postal_code,
    phone, timezone, is_active
) SELECT 
    'MAPLEWOOD', 'Maplewood Family YMCA', 'Maplewood Y',
    id, '25 Driving Park Ave', 'Rochester', 'NY', '14613',
    '585-647-3600', 'America/New_York', TRUE
FROM ymca_associations WHERE code = 'GROC'
ON CONFLICT (association_id, code) DO NOTHING;

-- 5. Northwest Family YMCA
INSERT INTO ymca_branches (
    code, name, short_name, association_id,
    address_line1, city, state_code, postal_code,
    phone, timezone, is_active
) SELECT 
    'NORTHWEST', 'Northwest Family YMCA', 'Northwest Y',
    id, '730 Long Pond Road', 'Rochester', 'NY', '14612',
    '585-227-3900', 'America/New_York', TRUE
FROM ymca_associations WHERE code = 'GROC'
ON CONFLICT (association_id, code) DO NOTHING;

-- 6. Sands Family YMCA
INSERT INTO ymca_branches (
    code, name, short_name, association_id,
    address_line1, city, state_code, postal_code,
    phone, timezone, is_active
) SELECT 
    'SANDS', 'Sands Family YMCA', 'Sands Y',
    id, '351 North Street', 'Canandaigua', 'NY', '14424',
    '585-396-8700', 'America/New_York', TRUE
FROM ymca_associations WHERE code = 'GROC'
ON CONFLICT (association_id, code) DO NOTHING;

-- 7. Schottland Family YMCA
INSERT INTO ymca_branches (
    code, name, short_name, association_id,
    address_line1, city, state_code, postal_code,
    phone, timezone, is_active
) SELECT 
    'SCHOTTLAND', 'Schottland Family YMCA', 'Schottland Y',
    id, '2300 West Jefferson Road', 'Pittsford', 'NY', '14534',
    '585-446-2000', 'America/New_York', TRUE
FROM ymca_associations WHERE code = 'GROC'
ON CONFLICT (association_id, code) DO NOTHING;

-- 8. Lewis Street YMCA Neighborhood Center
INSERT INTO ymca_branches (
    code, name, short_name, association_id,
    address_line1, city, state_code, postal_code,
    phone, timezone, is_active
) SELECT 
    'LEWIS', 'The Lewis Street YMCA Neighborhood Center', 'Lewis Street Y',
    id, '53 Lewis Street', 'Rochester', 'NY', '14605',
    '585-325-2572', 'America/New_York', TRUE
FROM ymca_associations WHERE code = 'GROC'
ON CONFLICT (association_id, code) DO NOTHING;

-- 9. Thurston Road YMCA Neighborhood Center
INSERT INTO ymca_branches (
    code, name, short_name, association_id,
    address_line1, city, state_code, postal_code,
    phone, timezone, is_active
) SELECT 
    'THURSTON', 'The Thurston Road YMCA Neighborhood Center', 'Thurston Road Y',
    id, '597 Thurston Road', 'Rochester', 'NY', '14619',
    '585-328-9330', 'America/New_York', TRUE
FROM ymca_associations WHERE code = 'GROC'
ON CONFLICT (association_id, code) DO NOTHING;

-- 10. The Y at Watson Woods
INSERT INTO ymca_branches (
    code, name, short_name, association_id,
    address_line1, city, state_code, postal_code,
    phone, timezone, is_active
) SELECT 
    'WATSONWOODS', 'The Y at Watson Woods', 'Watson Woods Y',
    id, '9620 Dry Run Road', 'Painted Post', 'NY', '14870',
    '607-962-0541', 'America/New_York', TRUE
FROM ymca_associations WHERE code = 'GROC'
ON CONFLICT (association_id, code) DO NOTHING;

-- 11. The YMCA at Innovation Square
INSERT INTO ymca_branches (
    code, name, short_name, association_id,
    address_line1, city, state_code, postal_code,
    phone, timezone, is_active
) SELECT 
    'INNOVSQ', 'The YMCA at Innovation Square', 'Innovation Square Y',
    id, '100 S Clinton Ave Suite C250', 'Rochester', 'NY', '14604',
    '585-723-3020', 'America/New_York', TRUE
FROM ymca_associations WHERE code = 'GROC'
ON CONFLICT (association_id, code) DO NOTHING;

-- 12. Westside Family YMCA
INSERT INTO ymca_branches (
    code, name, short_name, association_id,
    address_line1, city, state_code, postal_code,
    phone, timezone, is_active
) SELECT 
    'WESTSIDE', 'Westside Family YMCA', 'Westside Y',
    id, '920 Elmgrove Road', 'Rochester', 'NY', '14624',
    '585-247-3501', 'America/New_York', TRUE
FROM ymca_associations WHERE code = 'GROC'
ON CONFLICT (association_id, code) DO NOTHING;
```

---

## Part 4: Views

```sql
-- Alliance with state coverage
CREATE OR REPLACE VIEW v_alliance_coverage AS
SELECT 
    a.id AS alliance_id,
    a.code AS alliance_code,
    a.name AS alliance_name,
    a.alliance_type,
    a.website_url,
    a.is_active,
    STRING_AGG(s.code, ', ' ORDER BY yas.is_primary DESC, s.code) AS state_codes,
    STRING_AGG(s.name, ', ' ORDER BY yas.is_primary DESC, s.name) AS state_names,
    COUNT(s.code) AS state_count
FROM ymca_alliances a
LEFT JOIN ymca_alliance_states yas ON a.id = yas.alliance_id
LEFT JOIN us_states s ON yas.state_code = s.code
GROUP BY a.id, a.code, a.name, a.alliance_type, a.website_url, a.is_active;

-- State with alliance info
CREATE OR REPLACE VIEW v_state_alliance AS
SELECT 
    s.code AS state_code,
    s.name AS state_name,
    s.is_territory,
    a.id AS alliance_id,
    a.code AS alliance_code,
    a.name AS alliance_name,
    a.alliance_type,
    yas.is_primary AS is_primary_state
FROM us_states s
LEFT JOIN ymca_alliance_states yas ON s.code = yas.state_code
LEFT JOIN ymca_alliances a ON yas.alliance_id = a.id
ORDER BY s.name;

-- Full organizational hierarchy
CREATE OR REPLACE VIEW v_org_hierarchy AS
SELECT 
    al.code AS alliance_code,
    al.name AS alliance_name,
    al.alliance_type,
    assoc.code AS association_code,
    assoc.name AS association_name,
    assoc.hq_city AS association_city,
    b.code AS branch_code,
    b.name AS branch_name,
    b.city AS branch_city,
    b.state_code,
    b.is_active AS branch_active
FROM ymca_branches b
JOIN ymca_associations assoc ON b.association_id = assoc.id
LEFT JOIN ymca_alliances al ON assoc.alliance_id = al.id
ORDER BY al.name, assoc.name, b.name;

-- Association summary (for dashboards)
CREATE OR REPLACE VIEW v_association_summary AS
SELECT 
    assoc.id,
    assoc.code,
    assoc.name,
    assoc.hq_city,
    assoc.state_code,
    al.name AS alliance_name,
    assoc.subscription_tier,
    assoc.subscription_status,
    assoc.is_active,
    COUNT(b.id) AS branch_count,
    COUNT(b.id) FILTER (WHERE b.is_active) AS active_branch_count
FROM ymca_associations assoc
LEFT JOIN ymca_alliances al ON assoc.alliance_id = al.id
LEFT JOIN ymca_branches b ON assoc.id = b.association_id
GROUP BY assoc.id, assoc.code, assoc.name, assoc.hq_city, assoc.state_code,
         al.name, assoc.subscription_tier, assoc.subscription_status, assoc.is_active;
```

---

## Part 5: Helper Functions

```sql
-- Get alliance for a state
CREATE OR REPLACE FUNCTION get_alliance_for_state(p_state_code CHAR(2))
RETURNS TABLE (
    alliance_id UUID,
    alliance_code VARCHAR(20),
    alliance_name VARCHAR(200),
    alliance_type ymca_alliance_type,
    website_url VARCHAR(500)
) 
LANGUAGE SQL STABLE AS $$
    SELECT a.id, a.code, a.name, a.alliance_type, a.website_url
    FROM ymca_alliances a
    JOIN ymca_alliance_states yas ON a.id = yas.alliance_id
    WHERE yas.state_code = p_state_code AND a.is_active = TRUE;
$$;

-- Get all branches for an association
CREATE OR REPLACE FUNCTION get_branches_for_association(p_association_code VARCHAR(50))
RETURNS TABLE (
    branch_id UUID,
    branch_code VARCHAR(50),
    branch_name VARCHAR(200),
    city VARCHAR(100),
    state_code CHAR(2),
    is_active BOOLEAN
) 
LANGUAGE SQL STABLE AS $$
    SELECT b.id, b.code, b.name, b.city, b.state_code, b.is_active
    FROM ymca_branches b
    JOIN ymca_associations a ON b.association_id = a.id
    WHERE a.code = p_association_code
    ORDER BY b.name;
$$;
```

---

## Part 6: Row Level Security

```sql
ALTER TABLE us_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE ymca_alliances ENABLE ROW LEVEL SECURITY;
ALTER TABLE ymca_alliance_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE ymca_associations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ymca_branches ENABLE ROW LEVEL SECURITY;

-- Public read for lookup tables
CREATE POLICY "Public read: us_states" ON us_states FOR SELECT USING (TRUE);
CREATE POLICY "Public read: ymca_alliances" ON ymca_alliances FOR SELECT USING (TRUE);
CREATE POLICY "Public read: ymca_alliance_states" ON ymca_alliance_states FOR SELECT USING (TRUE);
CREATE POLICY "Read associations" ON ymca_associations FOR SELECT USING (TRUE);
CREATE POLICY "Read branches" ON ymca_branches FOR SELECT USING (TRUE);

-- For future multi-tenant, add policies like:
-- CREATE POLICY "Tenant isolation" ON ymca_branches
--     FOR ALL USING (association_id = (auth.jwt() ->> 'association_id')::UUID);
```

---

## Part 7: TypeScript Types

```typescript
// Enums
export type AllianceType = 'state' | 'regional';

// Core Entities
export interface UsState {
  id: string;
  code: string;
  name: string;
  is_territory: boolean;
  created_at: string;
  updated_at: string;
}

export interface YmcaAlliance {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  alliance_type: AllianceType;
  website_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  headquarters_city: string | null;
  headquarters_state_code: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface YmcaAssociation {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  alliance_id: string | null;
  state_code: string;
  website_url: string | null;
  main_phone: string | null;
  main_email: string | null;
  hq_address_line1: string | null;
  hq_address_line2: string | null;
  hq_city: string | null;
  hq_state_code: string | null;
  hq_postal_code: string | null;
  ein: string | null;
  is_active: boolean;
  subscription_tier: string | null;
  subscription_status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface YmcaBranch {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  association_id: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_code: string | null;
  postal_code: string | null;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  is_active: boolean;
  is_main_branch: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Constants
export const GREATER_ROCHESTER = {
  ASSOCIATION_CODE: 'GROC',
  ALLIANCE_CODE: 'NY',
  STATE_CODE: 'NY',
  TIMEZONE: 'America/New_York',
} as const;

export const GREATER_ROCHESTER_BRANCHES = {
  BAY_VIEW: 'BAYVIEW',
  CORNING: 'CORNING',
  EASTSIDE: 'EASTSIDE',
  MAPLEWOOD: 'MAPLEWOOD',
  NORTHWEST: 'NORTHWEST',
  SANDS: 'SANDS',
  SCHOTTLAND: 'SCHOTTLAND',
  LEWIS_STREET: 'LEWIS',
  THURSTON_ROAD: 'THURSTON',
  WATSON_WOODS: 'WATSONWOODS',
  INNOVATION_SQUARE: 'INNOVSQ',
  WESTSIDE: 'WESTSIDE',
} as const;

export type GreaterRochesterBranchCode = 
  typeof GREATER_ROCHESTER_BRANCHES[keyof typeof GREATER_ROCHESTER_BRANCHES];
```

---

## Part 8: Quick Reference

### Greater Rochester Branches

| Code | Name | City | Phone |
|------|------|------|-------|
| BAYVIEW | Bay View Family YMCA | Webster | 585-671-8414 |
| CORNING | Corning Family YMCA | Corning | 607-936-4638 |
| EASTSIDE | Eastside Family YMCA | Penfield | 585-341-4000 |
| MAPLEWOOD | Maplewood Family YMCA | Rochester | 585-647-3600 |
| NORTHWEST | Northwest Family YMCA | Rochester | 585-227-3900 |
| SANDS | Sands Family YMCA | Canandaigua | 585-396-8700 |
| SCHOTTLAND | Schottland Family YMCA | Pittsford | 585-446-2000 |
| LEWIS | Lewis Street YMCA Neighborhood Center | Rochester | 585-325-2572 |
| THURSTON | Thurston Road YMCA Neighborhood Center | Rochester | 585-328-9330 |
| WATSONWOODS | The Y at Watson Woods | Painted Post | 607-962-0541 |
| INNOVSQ | The YMCA at Innovation Square | Rochester | 585-723-3020 |
| WESTSIDE | Westside Family YMCA | Rochester | 585-247-3501 |

### Alliance Quick Reference

| Code | Type | States |
|------|------|--------|
| NY | state | New York |
| CA | state | California |
| TX | state | Texas |
| FL | state | Florida |
| NNE | regional | ME, NH, VT |
| UMW | regional | WI, MN |
| KYWY | regional | KY, WV |

### Common Queries

```sql
-- Get all Greater Rochester branches
SELECT * FROM get_branches_for_association('GROC');

-- Get full hierarchy
SELECT * FROM v_org_hierarchy WHERE association_code = 'GROC';

-- Get NY alliance info
SELECT * FROM get_alliance_for_state('NY');

-- Dashboard data
SELECT * FROM v_association_summary WHERE code = 'GROC';
```

---

## Implementation Notes

1. **Run order**: Execute SQL in the order presented (schema → seed data → views → functions → RLS)
2. **Idempotent**: All INSERT statements use `ON CONFLICT DO NOTHING` for safe re-runs
3. **Alliance codes are internal**: No official YMCA region codes exist
4. **Branch codes are unique per association**: `EASTSIDE` in GROC ≠ `EASTSIDE` in another association
5. **Future expansion**: Add new associations by inserting into `ymca_associations`, branches automatically scope via `association_id`

---

*Data sourced from rochesterymca.org and ymca.org (January 2026)*
