import { NextResponse } from "next/server";

type LogServerErrorParams = {
  req: Request;
  message: string;
  errorType: string;
  context: Record<string, unknown>;
  stack?: string | null;
};

function generateErrorCode(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

export async function logServerErrorToApi({
  req,
  message,
  errorType,
  context,
  stack,
}: LogServerErrorParams): Promise<string> {
  const errorCode = generateErrorCode();

  try {
    const origin = new URL(req.url).origin;
    const url = new URL("/api/errors/log", origin).toString();

    const secret = process.env.ERROR_LOG_SECRET || process.env.CRON_SECRET || "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (secret) headers["x-error-log-secret"] = secret;

    await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        error_code: errorCode,
        error_type: errorType,
        message,
        context,
        stack_trace: stack ?? null,
        source: "server",
        url: req.url,
        user_agent: req.headers.get("user-agent"),
      }),
    });
  } catch {
    // Never throw from error logging to avoid cascading failures.
  }

  return errorCode;
}

export async function serverErrorResponse(params: {
  req: Request;
  status?: number;
  errorType: string;
  publicMessage: string;
  logMessage: string;
  context: Record<string, unknown>;
  err?: unknown;
}): Promise<NextResponse> {
  const {
    req,
    status = 500,
    errorType,
    publicMessage,
    logMessage,
    context,
    err,
  } = params;

  const stack = err instanceof Error ? err.stack ?? null : null;
  const errorCode = await logServerErrorToApi({
    req,
    message: logMessage,
    errorType,
    context,
    stack,
  });

  return NextResponse.json(
    { error: publicMessage, error_code: errorCode },
    { status },
  );
}

