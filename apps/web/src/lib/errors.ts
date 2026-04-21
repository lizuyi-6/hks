export type ErrorType =
  | "ValidationError"
  | "NotFoundError"
  | "AuthError"
  | "BusinessError"
  | "SystemError"
  | "NetworkError"
  | "TimeoutError"
  | "UnknownError";

export type ProbeError = {
  errorType: ErrorType;
  errorLocation: string;
  message: string;
  requestId?: string;
  details?: Record<string, unknown>;
  timestamp: string;
  stack?: string;
};

export class ApplicationError extends Error {
  public readonly timestamp: string;

  constructor(
    message: string,
    public errorType: ErrorType,
    public errorLocation: string,
    public requestId?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApplicationError";
    this.timestamp = new Date().toISOString();
  }

  toJSON(): ProbeError {
    return {
      errorType: this.errorType,
      errorLocation: this.errorLocation,
      message: this.message,
      requestId: this.requestId,
      details: this.details,
      timestamp: new Date().toISOString(),
      stack: process.env.NODE_ENV === "development" ? this.stack : undefined,
    };
  }
}

function formatDetail(detail: unknown): string | null {
  if (detail == null) return null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // FastAPI 422 responses use ``{detail: [{loc, msg, type}, …]}``.
    const parts = detail
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object") {
          const e = entry as { msg?: unknown; loc?: unknown };
          const msg = typeof e.msg === "string" ? e.msg : JSON.stringify(e.msg ?? entry);
          const loc = Array.isArray(e.loc) ? e.loc.join(".") : "";
          return loc ? `${loc}: ${msg}` : msg;
        }
        return String(entry);
      })
      .filter(Boolean);
    return parts.length > 0 ? parts.join("; ") : null;
  }
  if (typeof detail === "object") {
    const obj = detail as Record<string, unknown>;
    // Backend sometimes wraps structured errors as ``{code, message, ...}``.
    // Surface ``message`` for humans, keep the rest for ``details``.
    if (typeof obj.message === "string" && obj.message.trim()) {
      return obj.message;
    }
    try {
      return JSON.stringify(detail);
    } catch {
      return null;
    }
  }
  return String(detail);
}

export function parseErrorResponse(
  text: string,
  location: string = "unknown"
): ApplicationError {
  try {
    const data = JSON.parse(text);
    if (data.errorType || data.detail || data.message) {
      const friendlyDetail = formatDetail(data.detail);
      // Preserve structured ``detail`` objects (e.g. ``{code, tier, quota,
      // used}``) so UI branches can pattern-match on the code without having
      // to re-parse the message string.
      const structuredDetails =
        data.details ??
        (data.detail && typeof data.detail === "object" && !Array.isArray(data.detail)
          ? (data.detail as Record<string, unknown>)
          : undefined);
      return new ApplicationError(
        data.message || friendlyDetail || "Unknown error",
        mapStatusToErrorType(data.errorType, text),
        data.errorLocation || location,
        data.requestId,
        structuredDetails
      );
    }
  } catch {
    // Not JSON, create error from text
  }
  return new ApplicationError(
    text || "Request failed",
    "UnknownError",
    location
  );
}

function mapStatusToErrorType(
  errorType: string | undefined,
  text: string
): ErrorType {
  if (errorType) {
    if (["ValidationError", "NotFoundError", "AuthError", "BusinessError", "SystemError", "NetworkError", "TimeoutError"].includes(errorType)) {
      return errorType as ErrorType;
    }
  }
  if (text.includes("401") || text.includes("未登录") || text.includes("Unauthorized")) {
    return "AuthError";
  }
  if (text.includes("404") || text.includes("Not Found")) {
    return "NotFoundError";
  }
  if (text.includes("422") || text.includes("Validation")) {
    return "ValidationError";
  }
  if (text.includes("timeout") || text.includes("超时")) {
    return "TimeoutError";
  }
  return "UnknownError";
}

export function getErrorDisplayInfo(errorType: ErrorType): { color: string; label: string } {
  switch (errorType) {
    case "SystemError":
      return { color: "red", label: "系统错误" };
    case "NetworkError":
    case "TimeoutError":
      return { color: "blue", label: "网络错误" };
    case "AuthError":
      return { color: "orange", label: "认证错误" };
    case "NotFoundError":
      return { color: "gray", label: "未找到" };
    case "ValidationError":
      return { color: "yellow", label: "验证错误" };
    case "BusinessError":
      return { color: "purple", label: "业务错误" };
    default:
      return { color: "gray", label: "未知错误" };
  }
}
