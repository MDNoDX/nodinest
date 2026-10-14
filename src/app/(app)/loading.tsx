/**
 * Instant feedback on every navigation: rendered (and prefetched) before the
 * page's data arrives, so a click never feels dead on a slow connection.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <span className="sr-only">…</span>
      <div className="mb-8 flex items-center gap-4">
        <div className="bg-surface-2 size-11 rounded-xl" />
        <div className="flex flex-col gap-2">
          <div className="bg-surface-2 h-6 w-56 rounded-md" />
          <div className="bg-surface-2 h-4 w-80 max-w-[60vw] rounded-md" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i}>
            <div className="bg-surface-2 aspect-[2/3] w-full rounded-lg" />
            <div className="bg-surface-2 mt-2 h-4 w-4/5 rounded" />
            <div className="bg-surface-2 mt-1.5 h-3 w-1/2 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
