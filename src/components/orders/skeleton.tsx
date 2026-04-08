export function OrdersSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-12 bg-gray-100 rounded-md w-full" />
      <div className="rounded-md border border-gray-100">
        <div className="h-10 bg-gray-50 border-b border-gray-100" />
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-16 border-b border-gray-100 last:border-0" />
        ))}
      </div>
    </div>
  );
}