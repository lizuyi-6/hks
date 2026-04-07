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
  constructor(
    message: string,
    public errorType: ErrorType,
    public errorLocation: string,
    public requestId?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApplicationError";
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

export function parseErrorResponse(
  text: string,
  location: string = "unknown"
): ApplicationError {
  try {
    const data = JSON.parse(text);
    if (data.errorType || data.detail) {
      return new ApplicationError(
        data.message || data.detail || "Unknown error",
        mapStatusToErrorType(data.errorType, text),
        data.errorLocation || location,
        data.requestId,
        data.details
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
