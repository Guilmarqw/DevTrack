// Route-level loading state. Mirrors the real layout's shape so navigating in
// does not shift anything when the data lands.
export default function DashboardLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16" aria-busy="true">
      <span className="sr-only" role="status">
        Loading your projects…
      </span>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="skeleton h-6 w-32" />
          <div className="skeleton mt-2 h-4 w-48" />
        </div>
        <div className="skeleton h-7 w-20" />
      </div>

      <div className="mt-10">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton mt-3 h-40 w-full" />
      </div>

      <div className="mt-10">
        <div className="skeleton h-3 w-20" />
        <div className="mt-3 overflow-hidden rounded-lg border border-line bg-surface">
          {[0, 1, 2].map((row) => (
            <div key={row} className="border-b border-line px-4 py-3 last:border-0">
              <div className="skeleton h-4 w-40" />
              <div className="skeleton mt-2 h-3 w-64" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
