'use client';

import React, { Suspense } from 'react';
import Breadcrumb from "@/components/Breadcrumbs/dashboard";
import { OrdersManager } from '@/components/orders';
import { OrdersSkeleton } from '@/components/orders/skeleton';

/**
 * Orders Management Page
 * Following the Documents page pattern: Breadcrumbs + Suspense + Manager
 */
export default function OrdersPage() {
  return (
    <>
      <Breadcrumb pageName="Orders" />
      
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Suspense fallback={<OrdersSkeleton />}>
          <OrdersManager initialOrders={[]} />
        </Suspense>
      </div>
    </>
  );
}