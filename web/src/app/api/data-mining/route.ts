import { NextResponse, type NextRequest } from "next/server";
import type { QueryAPIResponse, ResultFormat } from "@/types/queries";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import OpenAI from "openai";

type AnthropicResponse = {
  content: { type: "text"; text: string }[];
};

type SqlExecutionResult = {
  success: boolean;
  error: string | null;
  data: Record<string, unknown>[];
  row_count: number;
  execution_time_ms: number;
};

// #region agent log
function debugLog(hypothesisId: string, location: string, message: string, data: Record<string, unknown>) {
  fetch("http://127.0.0.1:7242/ingest/507bda22-2ab8-4c67-b245-8738a4525e56", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "pre-fix",
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}
// #endregion

const FALLBACK_SAMPLE_ROWS = [
  { class_name: "Power Yoga", instructor: "Alex Kim", avg_attendance: 32 },
  { class_name: "Cycle 45", instructor: "Jordan Lee", avg_attendance: 29 },
  { class_name: "Pilates Core", instructor: "Morgan Diaz", avg_attendance: 25 },
  { class_name: "Bootcamp", instructor: "Taylor Chen", avg_attendance: 24 },
  { class_name: "Zumba", instructor: "Avery Patel", avg_attendance: 22 },
];

const BASE_PROMPT = `
You are an AI assistant that generates safe, read-only SQL for YMCA attendance data.

DATABASE SCHEMA:
- branches (id UUID, code TEXT, name TEXT, address, city, state, zip, phone, description)
- classes (id UUID, name TEXT, description TEXT, category TEXT)
- locations (id UUID, code TEXT, name TEXT)
- instructors (id UUID, first_name TEXT, last_name TEXT, nickname TEXT, branch_id UUID, raw_name TEXT)
- instructor_branches (id UUID, instructor_id UUID, branch_id UUID, is_primary BOOLEAN)
- schedules (id UUID, name TEXT, month_start DATE, status TEXT, published_at TIMESTAMPTZ)
- class_sessions (id UUID, class_id UUID, location_id UUID, day_of_week TEXT, start_time TIME, end_time TIME, schedule_id UUID, headcount INTEGER, session_date DATE, headcount_submitted_at TIMESTAMPTZ)
- session_instructors (session_id UUID, instructor_id UUID)

KEY RELATIONSHIPS:
- class_sessions.class_id -> classes.id
- class_sessions.location_id -> locations.id
- class_sessions.schedule_id -> schedules.id
- session_instructors.session_id -> class_sessions.id
- session_instructors.instructor_id -> instructors.id
- instructors.branch_id -> branches.id

RULES:
- Only produce SELECT statements (no INSERT/UPDATE/DELETE/DDL).
- Use the placeholder :branch_id for branch filtering when relevant.
- Use explicit JOINs and column aliases for clarity.
- Return a concise explanation, a resultFormat (table | short_list | single_value | time_series | aggregation | yes_no), and a reportTitle.
- Keep answers short and operational.

Respond ONLY with JSON using keys: sql, explanation, resultFormat, reportTitle, summary.
`.trim();

const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-sonnet-20241022";
const FALLBACK_ANTHROPIC_MODEL = "claude-3-5-sonnet-20240620";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    const branchId = typeof body?.branchId === "string" ? body.branchId : null;
    debugLog("H1", "route.ts:entry", "POST /api/data-mining", {
      queryLen: query.length,
      hasQuery: !!query,
      hasBranchId: !!branchId,
    });

    if (!query) {
      debugLog("H1", "route.ts:bad_request", "Missing query", {});
      return NextResponse.json(
        { success: false, error: "Query is required." },
        { status: 400 },
      );
    }

    // Read AI configuration from environment variables (.env.local)
    const provider = (process.env.AI_PROVIDER || "anthropic").toLowerCase();
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const temperature = Number(process.env.AI_TEMPERATURE ?? 0.1);
    
    // Select model based on provider
    const defaultModel = provider === "openai" ? DEFAULT_OPENAI_MODEL : DEFAULT_ANTHROPIC_MODEL;
    const model = process.env.AI_MODEL || defaultModel;
    
    const shouldUseAnthropic = provider === "anthropic" && apiKey;
    const shouldUseOpenAI = provider === "openai" && openaiKey;
    debugLog("H2", "route.ts:provider", "Provider config", {
      provider,
      hasApiKey: !!apiKey,
      hasOpenAIKey: !!openaiKey,
      model,
      temperature,
      shouldUseAnthropic: !!shouldUseAnthropic,
      shouldUseOpenAI: !!shouldUseOpenAI,
    });

    if (!shouldUseAnthropic && !shouldUseOpenAI) {
      debugLog("H2", "route.ts:mock", "Returning mock response", {});
      return NextResponse.json(buildMockResponse(query, "table"), { status: 200 });
    }

    let aiText: string | null = null;

    if (shouldUseAnthropic) {
      const aiResponse = await callAnthropic({ apiKey: apiKey!, model, temperature, query });
      if (!aiResponse) {
        debugLog("H3", "route.ts:anthropic_null", "Anthropic returned null", {});
        return NextResponse.json(buildMockResponse(query, "table"), { status: 200 });
      }
      aiText = aiResponse.content?.[0]?.text ?? null;
    } else if (shouldUseOpenAI) {
      aiText = await callOpenAI({
        apiKey: openaiKey!,
        model,
        temperature,
        query,
      });
      if (!aiText) {
        debugLog("H3", "route.ts:openai_null", "OpenAI returned null", {});
        return NextResponse.json(buildMockResponse(query, "table"), { status: 200 });
      }
    }

    const parsed = parseAssistantJson(aiText ?? "");
    if (!parsed) {
      debugLog("H4", "route.ts:parse_fail", "Failed to parse AI JSON", {});
      return NextResponse.json(buildMockResponse(query, "table"), { status: 200 });
    }

    const resultFormat: ResultFormat =
      parsed.resultFormat === "short_list" ||
      parsed.resultFormat === "single_value" ||
      parsed.resultFormat === "time_series" ||
      parsed.resultFormat === "aggregation" ||
      parsed.resultFormat === "yes_no"
        ? parsed.resultFormat
        : "table";

    // Sanitize SQL (strip ALL semicolons to avoid multi-statement or trailing ; errors)
    const semicolonCount = (parsed.sql.match(/;/g) || []).length;
    const sanitizedSql = parsed.sql.replace(/;/g, "");

    // Rewrite generate_series over time to timestamp-based (Postgres lacks time,time,interval overload)
    const gsTimePattern = /generate_series\(\s*([^,]+)::time\s*,\s*([^,]+)::time\s*,\s*([^)]+)\)/gi;
    const generateSeriesRewrites = {
      timePatternMatches: (sanitizedSql.match(gsTimePattern) || []).length,
    };
    const sqlWithGenerateSeriesFix = sanitizedSql.replace(gsTimePattern, (_m, a1, a2, a3) => {
      // Return time values to avoid timestamp/time comparison errors
      return `generate_series((CURRENT_DATE + ${a1}::time), (CURRENT_DATE + ${a2}::time), ${a3})::time`;
    });

    // Require branch_id if the SQL expects it
    const needsBranch = sanitizedSql.includes(":branch_id");
    if (needsBranch && !branchId) {
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/507bda22-2ab8-4c67-b245-8738a4525e56", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "debug1",
          hypothesisId: "D",
          location: "route.ts:missing_branch",
          message: "branchId missing but SQL requires :branch_id",
          data: {
            sanitizedLen: sanitizedSql.length,
            sqlHead: sanitizedSql.slice(0, 200),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      return NextResponse.json(
        {
          success: false,
          error: "branchId is required for this query. Please select or provide a branch.",
          clarificationNeeded: "Select a branch and try again.",
        },
        { status: 200 },
      );
    }
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/507bda22-2ab8-4c67-b245-8738a4525e56", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "debug1",
        hypothesisId: "A",
        location: "route.ts:sanitize",
        message: "SQL sanitize before execution",
        data: {
          rawLen: parsed.sql.length,
          sanitizedLen: sanitizedSql.length,
          semicolonCount,
          generateSeriesRewrites,
          branchIdProvided: !!branchId,
          rawHead: parsed.sql.slice(0, 180),
          sanitizedHead: sqlWithGenerateSeriesFix.slice(0, 180),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    // Execute the SQL against the database
    const sqlResult = await executeSql(sqlWithGenerateSeriesFix, branchId);
    debugLog("H3", "route.ts:sql_result", "SQL execution result", {
      success: sqlResult.success,
      rowCount: sqlResult.row_count,
      executionTimeMs: sqlResult.execution_time_ms,
      error: sqlResult.error,
    });

    // If SQL execution failed, return error but include the generated SQL
    if (!sqlResult.success) {
      const errorResponse: QueryAPIResponse = {
        success: false,
        error: `SQL execution failed: ${sqlResult.error}`,
        clarificationNeeded: "The generated SQL could not be executed. Try rephrasing your question.",
      };
      return NextResponse.json(errorResponse, { status: 200 });
    }

    const response: QueryAPIResponse = {
      success: true,
      query: {
        id: crypto.randomUUID(),
        queryText: query,
        generatedSql: parsed.sql,
        explanation: parsed.explanation,
        resultFormat,
        reportTitle: parsed.reportTitle || "AI Generated Report",
      },
      results: {
        data: sqlResult.data,
        rowCount: sqlResult.row_count,
        executionTimeMs: sqlResult.execution_time_ms,
      },
      summary: parsed.summary || parsed.explanation || "AI generated summary.",
    };

    debugLog("H3", "route.ts:success", "Returning AI response with real data", {
      resultFormat,
      sqlLen: parsed.sql.length,
      rowCount: sqlResult.row_count,
    });
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    debugLog("H5", "route.ts:exception", "Unhandled exception", {
      message,
    });
    return NextResponse.json(
      { success: false, error: message || "Failed to process query." },
      { status: 500 },
    );
  }
}

function buildMockResponse(query: string, format: ResultFormat): QueryAPIResponse {
  return {
    success: true,
    query: {
      id: "mock-response",
      queryText: query,
      generatedSql:
        "select class_name, instructor, avg(attendance) as avg_attendance from class_attendance where branch_id = :branch_id and attended_on >= current_date - interval '7 days' group by class_name, instructor order by avg_attendance desc limit 5;",
      explanation:
        "Mocked AI response (AI provider not configured). Set AI_PROVIDER and corresponding API key in .env.local.",
      resultFormat: format,
      reportTitle: "Top Attendance (Mocked)",
    },
    results: {
      data: FALLBACK_SAMPLE_ROWS,
      rowCount: FALLBACK_SAMPLE_ROWS.length,
      executionTimeMs: 0,
    },
    summary:
      "Top attended classes over the last 7 days with average headcount per instructor (mocked).",
  };
}

async function callAnthropic(params: {
  apiKey: string;
  model: string;
  temperature: number;
  query: string;
}): Promise<AnthropicResponse | null> {
  const { apiKey, model, temperature, query } = params;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        temperature,
        system: BASE_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `User question: ${query}\nReturn JSON with keys: sql, explanation, resultFormat, reportTitle, summary.`,
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      debugLog("H3", "route.ts:anthropic_http_error", "Anthropic HTTP error", {
        status: res.status,
        statusText: res.statusText,
        body: text.slice(0, 500),
        model,
      });

      // Retry once with a known fallback model if the model is not found.
      if (res.status === 404 && model !== FALLBACK_ANTHROPIC_MODEL) {
        debugLog("H3", "route.ts:anthropic_retry_model", "Retrying with fallback model", {
          retryModel: FALLBACK_ANTHROPIC_MODEL,
        });
        return callAnthropic({
          apiKey,
          model: FALLBACK_ANTHROPIC_MODEL,
          temperature,
          query,
        });
      }
      return null;
    }

    const data = (await res.json()) as AnthropicResponse;
    if (!data?.content?.length) {
      debugLog("H4", "route.ts:anthropic_empty", "Anthropic empty content", {});
      return null;
    }
    return data;
  } catch (err) {
    debugLog("H5", "route.ts:anthropic_fetch_error", "Anthropic fetch exception", {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function callOpenAI(params: {
  apiKey: string;
  model: string;
  temperature: number;
  query: string;
}): Promise<string | null> {
  const { apiKey, model, temperature, query } = params;
  const client = new OpenAI({ apiKey });
  try {
    const res = await client.chat.completions.create({
      model,
      temperature,
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: BASE_PROMPT },
        {
          role: "user",
          content: `User question: ${query}\nReturn JSON with keys: sql, explanation, resultFormat, reportTitle, summary.`,
        },
      ],
    });

    const text = res.choices?.[0]?.message?.content ?? "";
    if (!text) {
      debugLog("H4", "route.ts:openai_empty", "OpenAI empty content", {});
      return null;
    }
    return text;
  } catch (err) {
    debugLog("H5", "route.ts:openai_error", "OpenAI error", {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function parseAssistantJson(text: string | undefined) {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice) as {
      sql: string;
      explanation: string;
      resultFormat: ResultFormat;
      reportTitle?: string;
      summary?: string;
    };
  } catch {
    return null;
  }
}

async function executeSql(sql: string, branchId: string | null): Promise<SqlExecutionResult> {
  try {
    const supabase = createSupabaseServerClient();

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/507bda22-2ab8-4c67-b245-8738a4525e56", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "debug1",
        hypothesisId: "B",
        location: "route.ts:executeSql:pre_rpc",
        message: "About to call execute_readonly_sql",
        data: {
          sqlLen: sql.length,
          sqlHead: sql.slice(0, 180),
          branchIdProvided: !!branchId,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    const { data, error } = await supabase.rpc("execute_readonly_sql", {
      p_sql: sql,
      p_branch_id: branchId,
    });

    if (error) {
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/507bda22-2ab8-4c67-b245-8738a4525e56", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "debug1",
          hypothesisId: "C",
          location: "route.ts:executeSql:rpc_error",
          message: "Supabase RPC error",
          data: {
            errorMessage: error.message,
            errorCode: error.code,
            sqlLen: sql.length,
            sqlHead: sql.slice(0, 180),
            sqlTail: sql.slice(-180),
            semicolons: (sql.match(/;/g) || []).length,
            branchIdProvided: !!branchId,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      debugLog("H4", "route.ts:rpc_error", "Supabase RPC error", {
        message: error.message,
        code: error.code,
      });
      return {
        success: false,
        error: error.message,
        data: [],
        row_count: 0,
        execution_time_ms: 0,
      };
    }

    // The RPC returns a JSON object with success, error, data, row_count, execution_time_ms
    const result = data as SqlExecutionResult;
    return result;
  } catch (err) {
    debugLog("H5", "route.ts:exec_sql_error", "SQL execution exception", {
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to execute SQL",
      data: [],
      row_count: 0,
      execution_time_ms: 0,
    };
  }
}




