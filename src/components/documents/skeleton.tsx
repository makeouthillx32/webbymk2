import React from 'react';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`} />
  );
}

interface DocumentsSkeletonProps {
  viewMode?: 'grid' | 'list';
  count?: number;
}

export function DocumentsSkeleton({ viewMode = 'grid', count = 12 }: DocumentsSkeletonProps) {
  return (
    <div className="documents-skeleton">
      {/* Header Skeleton */}
      <div className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-6">
        {/* Title and View Controls */}
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-8 w-32" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>
        </div>

        {/* Breadcrumb Skeleton */}
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-16" />
        </div>

        {/* Search and Actions Skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="flex-1 h-10 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-20 rounded-lg" />
        </div>
      </div>

      {/* Content Skeleton */}
      <div className={`documents-content-skeleton ${
        viewMode === 'grid' 
          ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4'
          : 'space-y-2'
      }`}>
        {Array.from({ length: count }).map((_, index) => (
          <div
            key={index}
            className={`${
              viewMode === 'grid'
                ? 'p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800'
                : 'flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800'
            }`}
          >
            {viewMode === 'grid' ? (
              <GridItemSkeleton />
            ) : (
              <ListItemSkeleton />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function GridItemSkeleton() {
  return (
    <div className="flex flex-col items-center text-center">
      {/* Icon */}
      <Skeleton className="w-12 h-12 rounded-lg mb-3" />
      
      {/* Name */}
      <Skeleton className="h-4 w-full mb-2" />
      
      {/* Size */}
      <Skeleton className="h-3 w-16 mb-1" />
      
      {/* Date */}
      <Skeleton className="h-3 w-20 mb-2" />
      
      {/* Tags */}
      <div className="flex gap-1">
        <Skeleton className="h-5 w-12 rounded" />
        <Skeleton className="h-5 w-16 rounded" />
      </div>
    </div>
  );
}

function ListItemSkeleton() {
  return (
    <>
      {/* Icon */}
      <Skeleton className="w-6 h-6 rounded flex-shrink-0" />
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <Skeleton className="h-4 w-3/4 mb-2" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      
      {/* Actions */}
      <div className="flex items-center gap-2">
        <Skeleton className="w-4 h-4 rounded" />
        <Skeleton className="w-4 h-4 rounded" />
        <Skeleton className="w-6 h-6 rounded" />
      </div>
    </>
  );
}

interface SearchSkeletonProps {
  count?: number;
}

export function SearchSkeleton({ count = 5 }: SearchSkeletonProps) {
  return (
    <div className="search-skeleton space-y-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
          <Skeleton className="w-8 h-8 rounded flex-shrink-0" />
          <div className="flex-1">
            <Skeleton className="h-4 w-2/3 mb-2" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="w-16 h-6 rounded" />
        </div>
      ))}
    </div>
  );
}

interface UploadSkeletonProps {
  fileCount?: number;
}

export function UploadSkeleton({ fileCount = 3 }: UploadSkeletonProps) {
  return (
    <div className="upload-skeleton bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 min-w-[300px]">
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>
      
      <div className="space-y-3">
        {Array.from({ length: fileCount }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="flex-1">
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
            <Skeleton className="w-6 h-4 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default DocumentsSkeleton;