/**
 * Typed application errors. `code` is a stable identifier that the UI maps to
 * a translated message (messages/*.json → errors.<code>).
 */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "DUPLICATE"
  | "RATE_LIMITED"
  | "AI_UNAVAILABLE"
  | "AI_QUOTA"
  | "STORAGE_UNAVAILABLE"
  | "URL_BLOCKED"
  | "FETCH_FAILED"
  | "SESSION_OPEN_EXISTS"
  | "SESSION_OVERLAP"
  | "SESSION_STATE"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message?: string,
    public details?: Record<string, unknown>,
  ) {
    super(message ?? code);
    this.name = "AppError";
  }
}

export type FieldErrors = Record<string, string[]>;

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: ErrorCode;
      message?: string;
      fieldErrors?: FieldErrors;
      details?: Record<string, unknown>;
    };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });

export function toActionError(err: unknown): Extract<ActionResult, { ok: false }> {
  if (err instanceof AppError) {
    return {
      ok: false,
      code: err.code,
      message: err.code === "VALIDATION" ? err.message : undefined,
      fieldErrors: err.details?.fieldErrors as FieldErrors | undefined,
      details: err.code === "DUPLICATE" ? err.details : undefined,
    };
  }
  // Postgres unique violation → conflict
  const pgCode =
    (err as { code?: string; cause?: { code?: string } })?.cause?.code ??
    (err as { code?: string })?.code;
  if (pgCode === "23505") return { ok: false, code: "CONFLICT" };
  if (pgCode === "42501") return { ok: false, code: "FORBIDDEN" };
  // Never leak internals; log a redacted line server-side.
  console.error("[nodinest] internal error:", err instanceof Error ? err.message : "unknown");
  return { ok: false, code: "INTERNAL" };
}
