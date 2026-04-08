import ProductVariantsInline from "../ProductVariantsInline";
import type { ProductRow } from "../types";

interface VariantsTabProps {
  productId: string;
  detail: ProductRow;
  load: () => void;
}

export function VariantsTab({
  productId,
  detail,
  load,
}: VariantsTabProps) {
  return (
    <div>
      <ProductVariantsInline
        productId={productId}
        variants={detail.product_variants || []}
        onChanged={load}
      />
    </div>
  );
}