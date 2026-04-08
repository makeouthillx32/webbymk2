import ProductCategoriesInline from "../ProductCategoriesInline";
import type { ProductRow } from "../types";

interface CategoriesTabProps {
  productId: string;
  detail: ProductRow;
  availableCategories: any[];
  load: () => void;
}

export function CategoriesTab({
  productId,
  detail,
  availableCategories,
  load,
}: CategoriesTabProps) {
  return (
    <div>
      <ProductCategoriesInline
        productId={productId}
        assignedCategories={detail.categories || []}
        availableCategories={availableCategories}
        onChanged={load}
      />
    </div>
  );
}