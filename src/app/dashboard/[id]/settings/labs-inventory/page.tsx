// app/dashboard/[id]/settings/labs-inventory/page.tsx
'use client';

// Stock for the LABS catalog.
//
// research_inventory has the same columns as inventory and the same foreign key
// chain (research_inventory → research_product_variants → research_products),
// so this is the shop page pointed at the research tables rather than a second
// implementation. Stock rules are the numbers a customer is sold against; two
// copies of them would be the wrong thing to let drift.

import InventoryPage from '../inventory/page';

export default function LabsInventorySettingsPage() {
  return <InventoryPage catalog="labs" />;
}
