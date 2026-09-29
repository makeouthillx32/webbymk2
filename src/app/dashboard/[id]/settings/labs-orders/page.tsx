// app/dashboard/[id]/settings/labs-orders/page.tsx
//
// Orders for the LABS storefront (research orders only). Same manager, same
// fulfillment flow — including the research batch-allocation preflight —
// as the Shop Orders page; only the query is scoped. See
// lib/orders/fetchAdminOrders.ts.
import { Suspense } from 'react';
import Breadcrumb from "@/components/Breadcrumbs/dashboard";
import { OrdersManager } from '@/components/orders';
import { OrdersSkeleton } from '@/components/orders/skeleton';
import { fetchAdminOrders } from '@/lib/orders/fetchAdminOrders';

export default async function LabsOrdersPage() {
  const orders = await fetchAdminOrders({ researchOnly: true });

  return (
    <div>
      <Breadcrumb pageName="Labs Orders" />
      <Suspense fallback={<OrdersSkeleton />}>
        <OrdersManager initialOrders={orders} scope="labs" />
      </Suspense>
    </div>
  );
}
