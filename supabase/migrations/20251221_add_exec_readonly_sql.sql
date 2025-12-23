-- Migration: Add execute_readonly_sql function for Data Mining feature
-- This function executes SELECT-only SQL queries with branch scoping

CREATE OR REPLACE FUNCTION public.execute_readonly_sql(
  p_sql TEXT,
  p_branch_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sql TEXT;
  v_result JSON;
  v_trimmed TEXT;
  v_start_time TIMESTAMPTZ;
  v_elapsed_ms INTEGER;
BEGIN
  -- Normalize and validate
  v_trimmed := TRIM(BOTH FROM p_sql);

  -- Block empty queries
  IF v_trimmed = '' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Empty SQL query',
      'data', '[]'::JSON,
      'row_count', 0,
      'execution_time_ms', 0
    );
  END IF;

  -- Only allow SELECT statements (case-insensitive check)
  IF NOT (UPPER(v_trimmed) ~ '^(WITH\s|SELECT\s)') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only SELECT statements are allowed',
      'data', '[]'::JSON,
      'row_count', 0,
      'execution_time_ms', 0
    );
  END IF;

  -- Block dangerous patterns
  IF UPPER(v_trimmed) ~ '(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|EXECUTE|COPY|COMMENT|SET\s+ROLE|SECURITY\s+DEFINER)' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Statement contains forbidden keywords',
      'data', '[]'::JSON,
      'row_count', 0,
      'execution_time_ms', 0
    );
  END IF;

  -- Substitute :branch_id placeholder with actual value
  IF p_branch_id IS NOT NULL THEN
    v_sql := REPLACE(v_trimmed, ':branch_id', '''' || p_branch_id::TEXT || '''');
  ELSE
    v_sql := v_trimmed;
  END IF;

  -- Execute and measure time
  v_start_time := clock_timestamp();

  BEGIN
    EXECUTE 'SELECT COALESCE(json_agg(row_to_json(t)), ''[]''::JSON) FROM (' || v_sql || ') t'
    INTO v_result;
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'data', '[]'::JSON,
      'row_count', 0,
      'execution_time_ms', 0
    );
  END;

  v_elapsed_ms := EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start_time))::INTEGER;

  RETURN json_build_object(
    'success', true,
    'error', NULL,
    'data', COALESCE(v_result, '[]'::JSON),
    'row_count', COALESCE(json_array_length(v_result), 0),
    'execution_time_ms', v_elapsed_ms
  );
END;
$$;

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION public.execute_readonly_sql(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_readonly_sql(TEXT, UUID) TO service_role;

COMMENT ON FUNCTION public.execute_readonly_sql IS 'Executes a read-only SQL query with optional branch_id substitution. Returns JSON with data, row_count, and execution_time_ms.';





