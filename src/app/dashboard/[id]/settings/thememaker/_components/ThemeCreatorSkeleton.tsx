"use client";

import React from 'react';
import Breadcrumb from "@/components/Breadcrumbs/dashboard";

export const ThemeCreatorSkeleton = () => {
  return (
    <>
      <Breadcrumb pageName="Theme Creator" />
      <div className="flex h-[calc(100vh-8rem)] bg-background">
        {/* Mobile/Desktop Sidebar */}
        <div className="w-full md:w-80 border-r border-border bg-card overflow-hidden flex flex-col">
          {/* Header Skeleton */}
          <div className="p-4 border-b border-border animate-pulse">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-5 h-5 bg-muted rounded"></div>
              <div className="h-5 bg-muted rounded w-32"></div>
            </div>

            {/* Import/Export/Load Controls Skeleton */}
            <div className="flex gap-2 mb-4">
              <div className="flex-1 h-9 bg-muted rounded-md"></div>
              <div className="flex-1 h-9 bg-muted rounded-md"></div>
              <div className="flex-1 h-9 bg-muted rounded-md"></div>
            </div>

            {/* Form Fields Skeleton */}
            <div className="space-y-3">
              <div className="h-10 bg-muted rounded-md"></div>
              <div className="h-10 bg-muted rounded-md"></div>

              {/* Preview Color Skeleton */}
              <div className="space-y-1">
                <div className="h-3 bg-muted rounded w-20"></div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-muted rounded"></div>
                  <div className="flex-1 h-7 bg-muted rounded"></div>
                </div>
              </div>

              {/* Mode Toggle Skeleton */}
              <div className="flex rounded-lg bg-muted p-1">
                <div className="flex-1 h-8 bg-background rounded-md shadow-sm"></div>
                <div className="flex-1 h-8 bg-muted rounded-md"></div>
              </div>
            </div>
          </div>

          {/* Save Button Skeleton */}
          <div className="p-4 border-b border-border animate-pulse">
            <div className="h-10 bg-muted rounded-md"></div>
          </div>

          {/* Tab Navigation Skeleton */}
          <div className="flex border-b border-border animate-pulse">
            <div className="flex-1 h-10 bg-background border-b-2 border-muted"></div>
            <div className="flex-1 h-10 bg-muted"></div>
          </div>

          {/* Content Area Skeleton */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-4 animate-pulse">
              {/* Color Groups Skeleton */}
              {[1, 2, 3, 4].map((group) => (
                <div key={group} className="border border-border rounded-lg overflow-hidden">
                  {/* Group Header */}
                  <div className="p-3 bg-muted/50 flex items-center justify-between">
                    <div className="h-4 bg-muted rounded w-24"></div>
                    <div className="w-4 h-4 bg-muted rounded"></div>
                  </div>

                  {/* Group Content (first two expanded) */}
                  {group <= 2 && (
                    <div className="p-4 space-y-3 bg-card">
                      {[1, 2].map((color) => (
                        <div key={color} className="space-y-1">
                          <div className="h-3 bg-muted rounded w-16"></div>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-muted rounded border"></div>
                            <div className="flex-1 h-7 bg-muted rounded"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Preview Area Skeleton - Hidden on Mobile */}
        <div className="hidden md:flex flex-1 p-8 overflow-auto">
          <div className="max-w-6xl mx-auto w-full animate-pulse">
            <div className="mb-8">
              <div className="h-8 bg-muted rounded w-48 mb-2"></div>
              <div className="h-4 bg-muted rounded w-96"></div>
              <div className="mt-4 flex items-center gap-2">
                <div className="h-6 bg-muted rounded w-20"></div>
                <div className="h-4 bg-muted rounded w-32"></div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[1, 2, 3, 4].map((card) => (
                <div key={card} className="border border-border rounded-lg">
                  <div className="p-6 border-b border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-4 h-4 bg-muted rounded-full"></div>
                      <div className="h-5 bg-muted rounded w-32"></div>
                    </div>
                    <div className="h-4 bg-muted rounded w-48"></div>
                  </div>

                  <div className="p-6 space-y-4">
                    <div className="space-y-3">
                      <div className="h-4 bg-muted rounded w-24"></div>
                      <div className="grid grid-cols-4 gap-3">
                        {[1, 2, 3, 4].map((item) => (
                          <div key={item} className="text-center">
                            <div className="w-12 h-12 bg-muted rounded-lg mx-auto mb-2"></div>
                            <div className="h-3 bg-muted rounded w-12 mx-auto"></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 border border-border rounded-lg">
              <div className="p-6 border-b border-border">
                <div className="h-5 bg-muted rounded w-48 mb-2"></div>
                <div className="h-4 bg-muted rounded w-64"></div>
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                <div className="bg-card border-b border-border p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 bg-muted rounded-lg"></div>
                      <div className="flex gap-6">
                        <div className="h-4 bg-muted rounded w-16"></div>
                        <div className="h-4 bg-muted rounded w-12"></div>
                        <div className="h-4 bg-muted rounded w-10"></div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-8 bg-muted rounded w-16"></div>
                      <div className="w-8 h-8 bg-muted rounded-full"></div>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <div className="mb-6">
                    <div className="h-6 bg-muted rounded w-32 mb-2"></div>
                    <div className="h-4 bg-muted rounded w-80"></div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    {[1, 2, 3].map((stat) => (
                      <div key={stat} className="p-4 bg-card border border-border rounded-lg">
                        <div className="h-6 bg-muted rounded w-12 mb-1"></div>
                        <div className="h-3 bg-muted rounded w-20"></div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {[1, 2].map((section) => (
                      <div key={section} className="p-4 bg-card border border-border rounded-lg">
                        <div className="h-5 bg-muted rounded w-28 mb-3"></div>
                        <div className="space-y-3">
                          {[1, 2, 3].map((item) => (
                            <div key={item} className="flex items-center gap-3">
                              <div className="w-2 h-2 bg-muted rounded-full"></div>
                              <div className="h-3 bg-muted rounded flex-1"></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Preview Button - Visible only on Mobile */}
        <div className="md:hidden fixed bottom-4 left-4">
          <div className="w-14 h-14 bg-muted rounded-full animate-pulse"></div>
        </div>
      </div> {/* ← this is the missing closing tag */}
    </>
  );
};