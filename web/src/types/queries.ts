/**
 * Types for the Data Mining / Natural Language Query feature
 */

/** Result display format determined by AI */
export type ResultFormat =
  | "single_value"
  | "short_list"
  | "table"
  | "time_series"
  | "aggregation"
  | "yes_no";

/** AI provider configuration */
export type AIProvider = "anthropic" | "openai";

/** Successful AI response with generated SQL */
export type AIQueryResponse = {
  sql: string;
  explanation: string;
  resultFormat: ResultFormat;
  voiceSummaryTemplate: string;
  reportTitle: string;
};

/** AI response when clarification is needed */
export type AIErrorResponse = {
  error: string;
  clarificationNeeded?: string;
};

/** Combined AI response type */
export type AIResponse = AIQueryResponse | AIErrorResponse;

/** Type guard for error response */
export function isAIErrorResponse(response: AIResponse): response is AIErrorResponse {
  return "error" in response;
}

/** Query execution result */
export type QueryResult = {
  data: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
};

/** Complete query response from API */
export type QueryAPIResponse = {
  success: true;
  query: {
    id: string;
    queryText: string;
    generatedSql: string;
    explanation: string;
    resultFormat: ResultFormat;
    reportTitle: string;
  };
  results: QueryResult;
  summary: string;
} | {
  success: false;
  error: string;
  clarificationNeeded?: string;
};

/** Feedback rating for query quality */
export type FeedbackRating = 1 | 2; // 1 = thumbs down, 2 = thumbs up

/** Query history record from database */
export type QueryHistoryRecord = {
  id: string;
  userId: string;
  branchId: string;
  queryText: string;
  generatedSql: string | null;
  resultSummary: string | null;
  resultData: Record<string, unknown>[] | null;
  resultCount: number;
  executionTimeMs: number | null;
  feedbackRating: FeedbackRating | null;
  isSaved: boolean;
  savedName: string | null;
  category: QueryCategory | null;
  tags: string[];
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Query category options */
export type QueryCategory =
  | "attendance"
  | "scheduling"
  | "instructors"
  | "rooms"
  | "other";

/** Report format options */
export type ReportFormat = "pdf" | "xlsx" | "docx";

/** Report generation options */
export type ReportOptions = {
  title?: string;
  includeSummary: boolean;
  includeQuery: boolean;
  includeSql: boolean;
  includeCharts: boolean;
  orientation?: "portrait" | "landscape";
  includeTimestamp: boolean;
};

/** Report generation request */
export type GenerateReportRequest = {
  queryId: string;
  format: ReportFormat;
  options: ReportOptions;
};

/** Report generation response */
export type GenerateReportResponse = {
  downloadUrl: string;
  filename: string;
  fileSize: number;
  expiresAt: string;
};









