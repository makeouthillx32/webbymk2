'use client';

import React, { Suspense } from 'react';
import Breadcrumb from "@/components/Breadcrumbs/dashboard";
import { POS } from "@/components/POS";
import { POSSkeleton } from "@/components/POS/skeleton";

/**
 * POS Page
 * Following the Documents page pattern: Breadcrumbs + Suspense + Manager
 */
export default function POSPage() {
  return (
    <>
      <Breadcrumb pageName="Point of Sale" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Suspense fallback={<POSSkeleton />}>
          <POS />
        </Suspense>
      </div>
    </>
  );
}