import ProductInventoryInline from "../ProductInventoryInline";
import type { ProductRow } from "../types";

interface InventoryTabProps {
  detail: ProductRow;
  load: () => void;
}

export function InventoryTab({
  detail,
  load,
}: InventoryTabProps) {
  return (
    <div>
      <ProductInventoryInline 
        variants={detail.product_variants || []} 
        onChanged={load} 
      />
    </div>
  );
}