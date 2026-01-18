import { NextResponse, type NextRequest } from "next/server";
import type { QueryAPIResponse, ResultFormat } from "@/types/queries";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";
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
- locations (id UUID, branch_id UUID, code TEXT, name TEXT)
- instructors (id UUID, first_name TEXT, last_name TEXT, nickname TEXT, branch_id UUID, raw_name TEXT)
- instructor_branches (id UUID, instructor_id UUID, branch_id UUID, is_primary BOOLEAN)
- schedules (id UUID, branch_id UUID, name TEXT, month_start DATE, status TEXT, published_at TIMESTAMPTZ)
- class_sessions (id UUID, branch_id UUID, class_id UUID, location_id UUID, day_of_week TEXT, start_time TIME, end_time TIME, schedule_id UUID, headcount INTEGER, session_date DATE, headcount_submitted_at TIMESTAMPTZ)
- session_instructors (session_id UUID, instructor_id UUID)

KEY RELATIONSHIPS:
- class_sessions.class_id -> classes.id
- class_sessions.location_id -> locations.id
- class_sessions.schedule_id -> schedules.id
- session_instructors.session_id -> class_sessions.id
- session_instructors.instructor_id -> instructors.id
- instructors.branch_id -> branches.id
- schedules.branch_id -> branches.id
- class_sessions.branch_id -> branches.id
- locations.branch_id -> branches.id

RULES:
- Only produce SELECT statements (no INSERT/UPDATE/DELETE/DDL).
- Every query MUST be scoped to the selected branch by filtering with the placeholder :branch_id.
  - Prefer: class_sessions.branch_id = :branch_id (or schedules.branch_id = :branch_id, locations.branch_id = :branch_id, etc.)
  - Do NOT return SQL without :branch_id.
- Use explicit JOINs and column aliases for clarity.
- When the user specifies a column alias with "as XYZ", use double-quoted aliases to preserve case (e.g., AS "Instructor" not AS Instructor). This ensures capitalization appears correctly in results and reports.
- Return a concise explanation, a resultFormat (table | short_list | single_value | time_series | aggregation | yes_no), and a reportTitle.
- Keep answers short and operational.

Respond ONLY with JSON using keys: sql, explanation, resultFormat, reportTitle, summary.
`.trim();

const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-sonnet-20241022";
const FALLBACK_ANTHROPIC_MODEL = "claude-3-5-sonnet-20240620";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
    if (!required.ok) return required.response;

    const body = await req.json().catch(() => ({}));
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    const requestedBranchId = typeof body?.branchId === "string" ? body.branchId : null;

    // Server-enforced branch context:
    // - Branch users are ALWAYS forced to their assigned branch (ignore spoofed branchId)
    // - Admins can supply a branchId (e.g., from the Admin hierarchy selector)
    const access = required.access;
    const effectiveBranchId =
      access?.recipient_type === "Branch" && access ? access.branch_id : requestedBranchId;

    if (!query) {
      return NextResponse.json(
        { success: false, error: "Query is required." },
        { status: 400 },
      );
    }

    // For this app, Natural Language Queries must always be scoped to a branch hierarchy.
    if (!effectiveBranchId) {
      return NextResponse.json(
        {
          success: false,
          error: "branchId is required for this query. Please select or provide a branch.",
          clarificationNeeded: "Select a branch and try again.",
        },
        { status: 200 },
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
    if (!shouldUseAnthropic && !shouldUseOpenAI) {
      return NextResponse.json(buildMockResponse(query, "table"), { status: 200 });
    }

    const buildUserPrompt = (extra?: string) => {
      const lines = [
        `User question: ${query}`,
        extra ? extra.trim() : null,
        `Return JSON with keys: sql, explanation, resultFormat, reportTitle, summary.`,
      ].filter(Boolean);
      return lines.join("\n");
    };

    let aiText: string | null = null;

    if (shouldUseAnthropic) {
      const aiResponse = await callAnthropic({
        apiKey: apiKey!,
        model,
        temperature,
        query,
        userPrompt: buildUserPrompt(),
      });
      if (!aiResponse) {
        return NextResponse.json(buildMockResponse(query, "table"), { status: 200 });
      }
      aiText = aiResponse.content?.[0]?.text ?? null;
    } else if (shouldUseOpenAI) {
      aiText = await callOpenAI({
        apiKey: openaiKey!,
        model,
        temperature,
        query,
        userPrompt: buildUserPrompt(),
      });
      if (!aiText) {
        return NextResponse.json(buildMockResponse(query, "table"), { status: 200 });
      }
    }

    const parsed = parseAssistantJson(aiText ?? "");
    if (!parsed) {
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

    // Enforce branch scoping for NLQ (server-side, regardless of what the client sends)
    let effectiveSql = sqlWithGenerateSeriesFix;
    let effectiveParsed = parsed;
    let hasBranchPlaceholder = sanitizedSql.includes(":branch_id");

    // If the AI forgot the branch placeholder, retry once with a stronger instruction.
    // If it STILL omits :branch_id, we refuse to execute.
    if (!hasBranchPlaceholder) {
      const branchFixInstruction =
        "IMPORTANT: Your SQL MUST include a WHERE filter using the placeholder :branch_id. " +
        "Prefer class_sessions.branch_id = :branch_id (or schedules.branch_id = :branch_id, locations.branch_id = :branch_id). " +
        "Rewrite the SQL accordingly and return ONLY the JSON response.";

      let retryText: string | null = null;
      if (shouldUseAnthropic) {
        const retry = await callAnthropic({
          apiKey: apiKey!,
          model,
          temperature,
          query,
          userPrompt: buildUserPrompt(branchFixInstruction),
        });
        retryText = retry?.content?.[0]?.text ?? null;
      } else if (shouldUseOpenAI) {
        retryText = await callOpenAI({
          apiKey: openaiKey!,
          model,
          temperature,
          query,
          userPrompt: buildUserPrompt(branchFixInstruction),
        });
      }

      const retryParsed = parseAssistantJson(retryText ?? "");
      if (retryParsed?.sql) {
        const retrySanitizedSql = retryParsed.sql.replace(/;/g, "");
        hasBranchPlaceholder = retrySanitizedSql.includes(":branch_id");
        if (hasBranchPlaceholder) {
          effectiveParsed = retryParsed;
          effectiveSql = retrySanitizedSql.replace(gsTimePattern, (_m, a1, a2, a3) => {
            return `generate_series((CURRENT_DATE + ${a1}::time), (CURRENT_DATE + ${a2}::time), ${a3})::time`;
          });
        }
      }
    }

    if (!hasBranchPlaceholder) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Generated SQL must include the :branch_id placeholder so results are scoped to the selected branch.",
          clarificationNeeded:
            "Please rephrase your question (or include the branch context), then try again.",
        },
        { status: 200 },
      );
    }

    // Execute the SQL against the database
    const sqlResult = await executeSql(effectiveSql, effectiveBranchId);

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
        generatedSql: effectiveParsed.sql,
        explanation: effectiveParsed.explanation,
        resultFormat,
        reportTitle: effectiveParsed.reportTitle || "AI Generated Report",
      },
      results: {
        data: sqlResult.data,
        rowCount: sqlResult.row_count,
        executionTimeMs: sqlResult.execution_time_ms,
      },
      summary: effectiveParsed.summary || effectiveParsed.explanation || "AI generated summary.",
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
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
  userPrompt?: string;
}): Promise<AnthropicResponse | null> {
  const { apiKey, model, temperature, query, userPrompt } = params;

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
                text:
                  userPrompt ??
                  `User question: ${query}\nReturn JSON with keys: sql, explanation, resultFormat, reportTitle, summary.`,
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      // Retry once with a known fallback model if the model is not found.
      if (res.status === 404 && model !== FALLBACK_ANTHROPIC_MODEL) {
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
      return null;
    }
    return data;
  } catch (err) {
    return null;
  }
}

async function callOpenAI(params: {
  apiKey: string;
  model: string;
  temperature: number;
  query: string;
  userPrompt?: string;
}): Promise<string | null> {
  const { apiKey, model, temperature, query, userPrompt } = params;
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
          content:
            userPrompt ??
            `User question: ${query}\nReturn JSON with keys: sql, explanation, resultFormat, reportTitle, summary.`,
        },
      ],
    });

    const text = res.choices?.[0]?.message?.content ?? "";
    if (!text) {
      return null;
    }
    return text;
  } catch (err) {
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

    const { data, error } = await supabase.rpc("execute_readonly_sql", {
      p_sql: sql,
      p_branch_id: branchId,
    });

    if (error) {
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
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to execute SQL",
      data: [],
      row_count: 0,
      execution_time_ms: 0,
    };
  }
}











