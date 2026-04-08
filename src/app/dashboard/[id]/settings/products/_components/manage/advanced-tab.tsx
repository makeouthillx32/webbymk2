import { useState } from "react";
import { Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "react-hot-toast";

interface AdvancedTabProps {
  productId: string;
  productTitle: string;
  onDeleted: () => void;
}

export function AdvancedTab({
  productId,
  productTitle,
  onDeleted,
}: AdvancedTabProps) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (confirmText !== "DELETE") {
      toast.error("Please type DELETE to confirm");
      return;
    }

    if (!confirm(`Are you absolutely sure you want to permanently delete "${productTitle}"? This will delete:\n\n• The product\n• All variants\n• All inventory records\n• All category/collection assignments\n• All images\n\nThis action CANNOT be undone.`)) {
      return;
    }

    setDeleting(true);
    try {
      // Use Supabase direct deletion - cascading deletes will handle related records
      const response = await fetch('/api/supabase/delete-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      });

      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to delete product');
      }

      toast.success("Product permanently deleted");
      onDeleted();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to delete product");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Danger Zone */}
      <div className="border-2 border-red-500/50 rounded-lg p-6 bg-red-50/50 dark:bg-red-950/20">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="text-red-600 flex-shrink-0 mt-0.5" size={24} />
          <div>
            <h3 className="text-lg font-semibold text-red-900 dark:text-red-100">
              Danger Zone
            </h3>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">
              Permanently delete this product and all associated data
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800 rounded p-4 space-y-3">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              This will permanently delete:
            </p>
            <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1.5 ml-4">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                The product: <span className="font-semibold">{productTitle}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                All product variants (SKUs, options, pricing)
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                All inventory tracking records
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                All category and collection assignments
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                All product images
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Type <span className="font-mono bg-red-100 dark:bg-red-900 px-1.5 py-0.5 rounded">DELETE</span> to confirm
              </label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type DELETE here"
                className="border-red-300 dark:border-red-700 focus:border-red-500 focus:ring-red-500"
              />
            </div>

            <Button
              onClick={handleDelete}
              disabled={deleting || confirmText !== "DELETE"}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 size={16} className="mr-2" />
              {deleting ? "Deleting..." : "Permanently Delete Product"}
            </Button>
          </div>

          <p className="text-xs text-red-600 dark:text-red-400 font-medium">
            ⚠️ This action cannot be undone. All data will be permanently lost.
          </p>
        </div>
      </div>
    </div>
  );
}