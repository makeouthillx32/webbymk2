// app/dashboard/[id]/Orders/page.tsx
import { Suspense } from 'react';
import Breadcrumb from "@/components/Breadcrumbs/dashboard";
import { OrdersManager } from '@/components/orders';
import { OrdersSkeleton } from '@/components/orders/skeleton';
import { fetchAdminOrders } from '@/lib/orders/fetchAdminOrders';

export default async function OrdersPage() {
  const orders = await fetchAdminOrders();

  return (
    <div>
      <Breadcrumb pageName="Orders" />
      <Suspense fallback={<OrdersSkeleton />}>
        <OrdersManager initialOrders={orders} />
      </Suspense>
    </div>
  );
}
