/**
 * Production Error Logger
 * 
 * This module provides client-side error logging with:
 * - Timestamp-based unique error codes
 * - Branch and user context tracking
 * - Server-side persistence to error_logs table
 * - User-friendly error messages for display
 * 
 * PRODUCTION CODE - Do not remove during debug cleanup
 */

export type ErrorType = 
  | "DB_ERROR" 
  | "API_ERROR" 
  | "NETWORK_ERROR" 
  | "CLIENT_ERROR" 
  | "AUTH_ERROR";

export type ErrorContext = {
  page?: string;
  action?: string;
  branchId?: string;
  branchName?: string;
  userId?: string;
  userEmail?: string;
  params?: Record<string, unknown>;
};

/**
 * Generate a timestamp-based unique error code
 * Format: YYYYMMDDHHmmss-random (e.g., "20260107153045-a1b2c3")
 */
function generateErrorCode(): string {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-:T]/g, "")
    .slice(0, 14);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * Log an error to the server for tracking and notification
 * 
 * @param error - The error object or message string
 * @param type - Category of error (DB_ERROR, API_ERROR, etc.)
 * @param context - Optional context including branch, user, page info
 * @returns The generated error code for display to user
 * 
 * @example
 * ```typescript
 * try {
 *   await fetchData();
 * } catch (err) {
 *   const errorCode = await logError(err, "API_ERROR", {
 *     page: "scheduling",
 *     action: "fetchSessions",
 *     branchId: selectedBranchId,
 *     branchName: selectedBranch?.name,
 *   });
 *   toast.error(getUserErrorMessage(errorCode));
 * }
 * ```
 */
export async function logError(
  error: Error | string,
  type: ErrorType,
  context?: ErrorContext
): Promise<string> {
  const errorCode = generateErrorCode();
  const message = error instanceof Error ? error.message : error;
  const stackTrace = error instanceof Error ? error.stack : undefined;

  // Log to console for local debugging
  console.error(`[${errorCode}] ${type}:`, message, context);

  // Send to server for persistence and notification
  try {
    await fetch("/api/errors/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error_code: errorCode,
        error_type: type,
        message,
        branch_id: context?.branchId || null,
        branch_name: context?.branchName || null,
        user_id: context?.userId || null,
        user_email: context?.userEmail || null,
        context: {
          page: context?.page,
          action: context?.action,
          params: context?.params,
        },
        stack_trace: stackTrace,
        source: "client",
        url: typeof window !== "undefined" ? window.location.href : null,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      }),
    });
  } catch {
    // Silently fail - don't create an error loop
    console.error("Failed to log error to server");
  }

  return errorCode;
}

/**
 * Log an error from server-side code (API routes, server components)
 * Similar to logError but with server-specific context
 */
export async function logServerError(
  error: Error | string,
  type: ErrorType,
  context?: ErrorContext & { url?: string }
): Promise<string> {
  const errorCode = generateErrorCode();
  const message = error instanceof Error ? error.message : error;
  const stackTrace = error instanceof Error ? error.stack : undefined;

  // Log to server console
  console.error(`[${errorCode}] ${type}:`, message, context);

  // For server-side, we import supabase directly to avoid circular dependencies
  // This function is typically called from API routes that already have supabase access
  // So we return the error code and let the caller handle persistence if needed
  
  return errorCode;
}

/**
 * Get a user-friendly error message with the error code
 * Display this in toast notifications or error UI
 */
export function getUserErrorMessage(errorCode: string): string {
  return `Error ${errorCode} encountered. Please notify AWD Support.`;
}

/**
 * Get a formatted error message for specific error types
 * Provides more context-specific messaging
 */
export function getErrorTypeMessage(type: ErrorType): string {
  const messages: Record<ErrorType, string> = {
    DB_ERROR: "A database error occurred. Please try again or contact support.",
    API_ERROR: "Failed to communicate with the server. Please try again.",
    NETWORK_ERROR: "Network connection issue. Please check your internet connection.",
    CLIENT_ERROR: "An unexpected error occurred. Please refresh the page.",
    AUTH_ERROR: "Authentication error. Please sign in again.",
  };
  return messages[type];
}

