export default function WorkspaceLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Page title skeleton */}
      <div className="space-y-2">
        <div className="h-3 w-16 rounded bg-neutral-200" />
        <div className="h-7 w-48 rounded bg-neutral-200" />
        <div className="h-4 w-72 rounded bg-neutral-200" />
      </div>

      {/* KPI row skeleton */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface p-5 space-y-4">
            <div className="h-3 w-20 rounded bg-neutral-200" />
            <div className="h-10 w-24 rounded bg-neutral-200" />
            <div className="h-8 rounded bg-neutral-200 opacity-50" />
          </div>
        ))}
      </div>

      {/* Hero row skeleton */}
      <div className="grid gap-4 lg:grid-cols-[1.8fr_1fr]">
        <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
          <div className="h-5 w-32 rounded bg-neutral-200" />
          <div className="h-44 rounded bg-neutral-200 opacity-50" />
        </div>
        <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
          <div className="h-5 w-24 rounded bg-neutral-200" />
          <div className="h-44 rounded-full mx-auto w-44 bg-neutral-200 opacity-50" />
        </div>
      </div>

      {/* Two-col row skeleton */}
      <div className="grid gap-4 lg:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface p-5 space-y-3">
            <div className="h-4 w-24 rounded bg-neutral-200" />
            {[...Array(4)].map((_, j) => (
              <div key={j} className="space-y-1.5">
                <div className="flex justify-between">
                  <div className="h-3 w-20 rounded bg-neutral-200" />
                  <div className="h-3 w-8 rounded bg-neutral-200" />
                </div>
                <div className="h-1.5 rounded-full bg-neutral-200" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
