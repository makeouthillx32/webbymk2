// app/products/[slug]/loading.tsx
export default function Loading() {
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Image Gallery Skeleton */}
        <div className="space-y-4">
          {/* Main Image */}
          <div className="aspect-square bg-muted animate-pulse rounded-lg" />
          
          {/* Thumbnail Strip */}
          <div className="grid grid-cols-6 gap-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="aspect-square bg-muted animate-pulse rounded-md" />
            ))}
          </div>
        </div>

        {/* Product Info Skeleton */}
        <div className="space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <div className="h-10 bg-muted animate-pulse rounded w-3/4" />
          </div>

          {/* Price */}
          <div className="h-12 bg-muted animate-pulse rounded w-1/3" />

          {/* Description */}
          <div className="space-y-2">
            <div className="h-4 bg-muted animate-pulse rounded w-full" />
            <div className="h-4 bg-muted animate-pulse rounded w-full" />
            <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
          </div>

          {/* Variant Options */}
          <div className="space-y-3">
            <div className="h-5 bg-muted animate-pulse rounded w-24" />
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 w-16 bg-muted animate-pulse rounded" />
              ))}
            </div>
          </div>

          {/* Stock Status */}
          <div className="h-5 bg-muted animate-pulse rounded w-48" />

          {/* Add to Cart Buttons */}
          <div className="flex gap-3">
            <div className="flex-1 h-12 bg-muted animate-pulse rounded-lg" />
            <div className="h-12 w-12 bg-muted animate-pulse rounded-lg" />
            <div className="h-12 w-12 bg-muted animate-pulse rounded-lg" />
          </div>

          {/* Product Details */}
          <div className="border-t pt-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex justify-between">
                <div className="h-4 bg-muted animate-pulse rounded w-24" />
                <div className="h-4 bg-muted animate-pulse rounded w-32" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}