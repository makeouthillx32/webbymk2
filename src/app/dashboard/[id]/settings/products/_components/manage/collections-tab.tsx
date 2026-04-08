import ProductCollectionsInline from "../ProductCollectionsInline";
import type { ProductRow } from "../types";

interface CollectionsTabProps {
  productId: string;
  detail: ProductRow;
  availableCollections: any[];
  load: () => void;
}

export function CollectionsTab({
  productId,
  detail,
  availableCollections,
  load,
}: CollectionsTabProps) {
  return (
    <div>
      <ProductCollectionsInline
        productId={productId}
        assignedCollections={detail.collections || []}
        availableCollections={availableCollections}
        onChanged={load}
      />
    </div>
  );
}