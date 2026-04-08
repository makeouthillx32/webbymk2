// app/products/[slug]/_components/ProductPageSkeleton.tsx
export default function ProductPageSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb Skeleton */}
      <div className="flex items-center gap-2 mb-8">
        <div className="h-4 bg-muted animate-pulse rounded w-16" />
        <span className="text-muted-foreground">/</span>
        <div className="h-4 bg-muted animate-pulse rounded w-24" />
        <span className="text-muted-foreground">/</span>
        <div className="h-4 bg-muted animate-pulse rounded w-48" />
      </div>

      {/* Product Detail Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Image Gallery Skeleton */}
        <div className="space-y-4">
          {/* Main Image */}
          <div className="aspect-square bg-muted animate-pulse rounded-lg" />
          
          {/* Thumbnail Gallery */}
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </div>

        {/* Product Info Skeleton */}
        <div className="space-y-6">
          {/* Title */}
          <div className="h-10 bg-muted animate-pulse rounded w-3/4" />
          
          {/* Price */}
          <div className="h-8 bg-muted animate-pulse rounded w-32" />
          
          {/* Description */}
          <div className="space-y-2">
            <div className="h-4 bg-muted animate-pulse rounded w-full" />
            <div className="h-4 bg-muted animate-pulse rounded w-full" />
            <div className="h-4 bg-muted animate-pulse rounded w-2/3" />
          </div>

          {/* Options */}
          <div className="space-y-4">
            <div className="h-4 bg-muted animate-pulse rounded w-24 mb-2" />
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted animate-pulse rounded w-16" />
              ))}
            </div>
          </div>

          {/* Add to Cart */}
          <div className="flex gap-3">
            <div className="h-12 bg-muted animate-pulse rounded flex-1" />
            <div className="h-12 bg-muted animate-pulse rounded w-12" />
            <div className="h-12 bg-muted animate-pulse rounded w-12" />
          </div>

          {/* Product Details */}
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <div className="h-4 bg-muted animate-pulse rounded w-20" />
                <div className="h-4 bg-muted animate-pulse rounded w-32" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}