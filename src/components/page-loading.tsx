/**
 * What shows the moment a page is clicked, while its figures are worked out: the page's outline in
 * pale blocks, so the click answers at once and the page doesn't jump when it fills in.
 */
export function PageLoading({ tiles = true }: { tiles?: boolean }) {
  const block = "animate-pulse rounded-2xl border border-line bg-surface shadow-card";
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      {tiles ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={`${block} h-[74px]`} />
          ))}
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${block} h-96`} />
        <div className={`${block} h-96`} />
      </div>
    </div>
  );
}
