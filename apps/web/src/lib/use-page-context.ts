"use client";

/**
 * Page context — a tiny in-memory pub/sub so business pages can inject the
 * current "resource" they're viewing (asset id, match id, order id, …)
 * without having to wire every page through a global React provider.
 *
 * Usage:
 *
 * ```tsx
 * // Inside a page that knows which resource is being viewed:
 * useSetPageResource({ type: "compliance_profile", id: profile.id });
 *
 * // Anywhere else (e.g. the FloatingAgent):
 * const ctx = usePageResource();
 * ```
 *
 * The FloatingAgent combines the current ``usePathname()`` with whatever
 * the latest page injected here to build the ``/agent/proactive/peek``
 * request body.
 */
import { useEffect, useRef, useState } from "react";

export type PageResource = {
  type: string;
  id: string;
};

type Listener = (r: PageResource | null) => void;

let current: PageResource | null = null;
const listeners = new Set<Listener>();

function notify(next: PageResource | null) {
  current = next;
  listeners.forEach((fn) => {
    try {
      fn(next);
    } catch {
      // Listener errors must not break the pub/sub.
    }
  });
}

/**
 * Subscribe to the latest page resource. Re-renders on change.
 * Returns ``null`` when no page has injected anything.
 */
export function usePageResource(): PageResource | null {
  const [value, setValue] = useState<PageResource | null>(current);
  useEffect(() => {
    const fn: Listener = (next) => setValue(next);
    listeners.add(fn);
    // Sync with any value set between initial render and effect run.
    setValue(current);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return value;
}

/**
 * Declare the resource for the current page. Automatically clears when
 * the component unmounts / the resource changes, so navigating away
 * doesn't leave stale context behind.
 */
export function useSetPageResource(resource: PageResource | null): void {
  // Keep a ref so the cleanup doesn't depend on the callback identity.
  const last = useRef<PageResource | null>(null);
  const key = resource ? `${resource.type}:${resource.id}` : "";

  useEffect(() => {
    if (resource) {
      notify(resource);
      last.current = resource;
    }
    return () => {
      if (last.current) {
        notify(null);
        last.current = null;
      }
    };
  }, [key, resource]);
}
