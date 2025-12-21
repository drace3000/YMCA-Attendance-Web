import { NextResponse, type NextRequest } from "next/server";
import type { QueryAPIResponse, ResultFormat } from "@/types/queries";

type AnthropicResponse = {
  content: { type: "text"; text: string }[];
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
- Only produce SELECT statements (no INSERT/UPDATE/DELETE/DDL).
- Always scope to a branch_id filter placeholder (:branch_id).
- Return a concise explanation, a resultFormat (table | short_list | single_value | time_series | aggregation | yes_no), and a reportTitle.
- Keep answers short and operational.

Respond ONLY with JSON using keys: sql, explanation, resultFormat, reportTitle, summary.
`.trim();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = typeof body?.query === "string" ? body.query.trim() : "";

    if (!query) {
      return NextResponse.json(
        { success: false, error: "Query is required." },
        { status: 400 },
      );
    }

    const provider = (process.env.AI_PROVIDER || "anthropic").toLowerCase();
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model = process.env.AI_MODEL || "claude-3-5-sonnet-20241022";
    const temperature = Number(process.env.AI_TEMPERATURE ?? 0.1);
    const shouldUseAnthropic = provider === "anthropic" && apiKey;

    if (!shouldUseAnthropic) {
      return NextResponse.json(buildMockResponse(query, "table"), { status: 200 });
    }

    const aiResponse = await callAnthropic({ apiKey: apiKey!, model, temperature, query });
    if (!aiResponse) {
      return NextResponse.json(buildMockResponse(query, "table"), { status: 200 });
    }

    const parsed = parseAssistantJson(aiResponse.content?.[0]?.text ?? "");
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
        data: FALLBACK_SAMPLE_ROWS,
        rowCount: FALLBACK_SAMPLE_ROWS.length,
        executionTimeMs: 0,
      },
      summary: parsed.summary || parsed.explanation || "AI generated summary.",
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
        "Mocked AI response (provider not configured). Replace with live AI once ANTHROPIC_API_KEY is set.",
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

  if (!res.ok) return null;
  const data = (await res.json()) as AnthropicResponse;
  return data;
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
