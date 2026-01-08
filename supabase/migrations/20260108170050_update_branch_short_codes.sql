-- Migration: Update branch short codes to human-friendly values
-- Purpose: Display branch codes like BAYVIEW / CORNING in Maintenance UI
-- This is idempotent: only updates when the short_code differs.

BEGIN;

UPDATE public.ymca_branches
SET short_code = 'BAYVIEW'
WHERE code = 'bay_view_family_ymca'
  AND short_code IS DISTINCT FROM 'BAYVIEW';

UPDATE public.ymca_branches
SET short_code = 'CORNING'
WHERE code = 'corning_family_ymca'
  AND short_code IS DISTINCT FROM 'CORNING';

UPDATE public.ymca_branches
SET short_code = 'EASTSIDE'
WHERE code = 'eastside_family_ymca'
  AND short_code IS DISTINCT FROM 'EASTSIDE';

UPDATE public.ymca_branches
SET short_code = 'MAIN'
WHERE code = 'main_branch'
  AND short_code IS DISTINCT FROM 'MAIN';

UPDATE public.ymca_branches
SET short_code = 'MAPLEWOOD'
WHERE code = 'maplewood_family_ymca'
  AND short_code IS DISTINCT FROM 'MAPLEWOOD';

UPDATE public.ymca_branches
SET short_code = 'NORTHWEST'
WHERE code = 'northwest_family_ymca'
  AND short_code IS DISTINCT FROM 'NORTHWEST';

UPDATE public.ymca_branches
SET short_code = 'SANDS'
WHERE code = 'sands_family_ymca'
  AND short_code IS DISTINCT FROM 'SANDS';

UPDATE public.ymca_branches
SET short_code = 'SCHOTTLAND'
WHERE code = 'schottland_family_ymca'
  AND short_code IS DISTINCT FROM 'SCHOTTLAND';

UPDATE public.ymca_branches
SET short_code = 'LEWIS'
WHERE code = 'the_lewis_street_ymca_neighborhood_center'
  AND short_code IS DISTINCT FROM 'LEWIS';

UPDATE public.ymca_branches
SET short_code = 'THURSTON'
WHERE code = 'the_thurston_road_ymca_neighborhood_center'
  AND short_code IS DISTINCT FROM 'THURSTON';

UPDATE public.ymca_branches
SET short_code = 'WATSONWOODS'
WHERE code = 'the_y_at_watson_woods'
  AND short_code IS DISTINCT FROM 'WATSONWOODS';

UPDATE public.ymca_branches
SET short_code = 'INNOVSQ'
WHERE code = 'the_ymca_at_innovation_square'
  AND short_code IS DISTINCT FROM 'INNOVSQ';

UPDATE public.ymca_branches
SET short_code = 'WESTSIDE'
WHERE code = 'westside_family_ymca'
  AND short_code IS DISTINCT FROM 'WESTSIDE';

-- Keep association office code as-is but ensure it is populated
UPDATE public.ymca_branches
SET short_code = 'AO'
WHERE code = 'ymca_of_greater_rochester_association_office'
  AND (short_code IS NULL OR short_code = '' OR short_code IS DISTINCT FROM 'AO');

COMMIT;
