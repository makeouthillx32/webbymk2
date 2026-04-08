export default function CategoryPageSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb Skeleton */}
      <div className="flex items-center gap-2 mb-8">
        <div className="h-4 bg-muted animate-pulse rounded w-16" />
        <span className="text-muted-foreground">/</span>
        <div className="h-4 bg-muted animate-pulse rounded w-24" />
        <span className="text-muted-foreground">/</span>
        <div className="h-4 bg-muted animate-pulse rounded w-32" />
      </div>

      {/* Header Skeleton */}
      <div className="mb-12">
        <div className="h-10 bg-muted animate-pulse rounded w-1/3 mb-4" />
      </div>

      {/* Subcategories Skeleton */}
      <div className="mb-12">
        <div className="h-6 bg-muted animate-pulse rounded w-32 mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>

      {/* Filter Bar Skeleton */}
      <div className="flex items-center justify-between mb-8">
        <div className="h-4 bg-muted animate-pulse rounded w-32" />
        <div className="flex gap-4">
          <div className="h-10 bg-muted animate-pulse rounded w-32" />
        </div>
      </div>

      {/* Product Grid Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="group">
            {/* Image */}
            <div className="aspect-square bg-muted animate-pulse rounded-lg mb-4" />
            {/* Title */}
            <div className="h-4 bg-muted animate-pulse rounded w-3/4 mb-2" />
            {/* Price */}
            <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}