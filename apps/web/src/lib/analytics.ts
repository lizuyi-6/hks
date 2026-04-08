type EventType = "page_view" | "click" | "form_submit" | "api_performance" | "error";

interface BaseEvent {
  event: EventType;
  timestamp: number;
  page?: string;
}

interface PageViewEvent extends BaseEvent {
  event: "page_view";
  referrer?: string;
}

interface ClickEvent extends BaseEvent {
  event: "click";
  element: string;
  elementText?: string;
}

interface FormSubmitEvent extends BaseEvent {
  event: "form_submit";
  form_id: string;
  success: boolean;
  error_message?: string;
}

interface APIPerformanceEvent extends BaseEvent {
  event: "api_performance";
  endpoint: string;
  method: string;
  status_code: number;
  duration_ms: number;
}

interface ErrorEvent extends BaseEvent {
  event: "error";
  error_type: "js_error" | "api_error" | "network_error";
  message: string;
  stack?: string;
}

type AnalyticsEvent = PageViewEvent | ClickEvent | FormSubmitEvent | APIPerformanceEvent | ErrorEvent;

interface AnalyticsConfig {
  enabled: boolean;
  debug: boolean;
  endpoint: string;
  flushInterval: number;
  maxQueueSize: number;
}

const defaultConfig: AnalyticsConfig = {
  enabled: true,
  debug: process.env.NODE_ENV === "development",
  endpoint: "/api/analytics/events",
  flushInterval: 5000,
  maxQueueSize: 50
};

class Analytics {
  private config: AnalyticsConfig;
  private queue: AnalyticsEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private sessionId: string;

  constructor(config: Partial<AnalyticsConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.sessionId = this.generateSessionId();
    this.startFlushTimer();
    this.setupErrorHandler();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushTimer = setInterval(() => this.flush(), this.config.flushInterval);
  }

  private setupErrorHandler(): void {
    if (typeof window === "undefined") return;

    const originalOnerror = window.onerror;
    window.onerror = (message, source, lineno, colno, error) => {
      this.trackError({
        event: "error",
        error_type: "js_error",
        message: String(message),
        stack: error?.stack,
        timestamp: Date.now()
      });

      if (originalOnerror) {
        return originalOnerror(message, source, lineno, colno, error);
      }
      return false;
    };

    const originalUnhandledRejection = window.onunhandledrejection;
    window.onunhandledrejection = (event) => {
      this.trackError({
        event: "error",
        error_type: "js_error",
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stack: event.reason?.stack,
        timestamp: Date.now()
      });

      if (originalUnhandledRejection) {
        return originalUnhandledRejection(event);
      }
    };
  }

  private async sendToServer(events: AnalyticsEvent[]): Promise<void> {
    if (events.length === 0) return;

    try {
      const response = await fetch(this.config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          events,
          session_id: this.sessionId
        }),
        keepalive: true
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      if (this.config.debug) {
        console.log("[Analytics] Sent events:", events.length);
      }
    } catch (error) {
      if (this.config.debug) {
        console.error("[Analytics] Failed to send events:", error);
      }
    }
  }

  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const eventsToSend = [...this.queue];
    this.queue = [];
    await this.sendToServer(eventsToSend);
  }

  public track(event: AnalyticsEvent): void {
    if (!this.config.enabled) return;

    if (this.config.debug) {
      console.log("[Analytics] Track:", event);
    }

    this.queue.push(event);

    if (this.queue.length >= this.config.maxQueueSize) {
      this.flush();
    }
  }

  public trackPageView(page: string, referrer?: string): void {
    this.track({
      event: "page_view",
      page,
      referrer,
      timestamp: Date.now()
    });
  }

  public trackClick(element: string, elementText?: string): void {
    this.track({
      event: "click",
      element,
      elementText,
      page: typeof window !== "undefined" ? window.location.pathname : undefined,
      timestamp: Date.now()
    });
  }

  public trackFormSubmit(formId: string, success: boolean, errorMessage?: string): void {
    this.track({
      event: "form_submit",
      form_id: formId,
      success,
      error_message: errorMessage,
      page: typeof window !== "undefined" ? window.location.pathname : undefined,
      timestamp: Date.now()
    });
  }

  public trackAPIPerformance(
    endpoint: string,
    method: string,
    statusCode: number,
    durationMs: number
  ): void {
    this.track({
      event: "api_performance",
      endpoint,
      method,
      status_code: statusCode,
      duration_ms: durationMs,
      page: typeof window !== "undefined" ? window.location.pathname : undefined,
      timestamp: Date.now()
    });
  }

  public trackError(event: Omit<ErrorEvent, "timestamp" | "page">): void {
    this.track({
      ...event,
      page: typeof window !== "undefined" ? window.location.pathname : undefined,
      timestamp: Date.now()
    } as ErrorEvent);
  }

  public async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

export const analytics = new Analytics();
export const trackEvent = (event: AnalyticsEvent) => analytics.track(event);
export const trackPageView = (page: string, referrer?: string) => analytics.trackPageView(page, referrer);
export const trackClick = (element: string, elementText?: string) => analytics.trackClick(element, elementText);
export const trackFormSubmit = (formId: string, success: boolean, errorMessage?: string) =>
  analytics.trackFormSubmit(formId, success, errorMessage);
export const trackAPIPerformance = (
  endpoint: string,
  method: string,
  statusCode: number,
  durationMs: number
) => analytics.trackAPIPerformance(endpoint, method, statusCode, durationMs);
export const trackError = (event: Omit<ErrorEvent, "timestamp" | "page">) => analytics.trackError(event);
