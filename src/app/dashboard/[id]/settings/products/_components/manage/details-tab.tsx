import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { centsToMoney } from "../utils";
import type { ProductRow } from "../types";

interface DetailsTabProps {
  detail: ProductRow;
  formTitle: string;
  formSlug: string;
  formPrice: string;
  formBadge: string;
  formMaterial: string;
  formMadeIn: string;
  formDesc: string;
  formFeatured: boolean;
  formStatus: "draft" | "active" | "archived";
  saving: boolean;
  setFormTitle: (v: string) => void;
  setFormSlug: (v: string) => void;
  setFormPrice: (v: string) => void;
  setFormBadge: (v: string) => void;
  setFormMaterial: (v: string) => void;
  setFormMadeIn: (v: string) => void;
  setFormDesc: (v: string) => void;
  setFormFeatured: (v: boolean) => void;
  setFormStatus: (v: "draft" | "active" | "archived") => void;
  autoSlug: () => void;
  saveDetails: () => void;
}

export function DetailsTab({
  detail,
  formTitle,
  formSlug,
  formPrice,
  formBadge,
  formMaterial,
  formMadeIn,
  formDesc,
  formFeatured,
  formStatus,
  saving,
  setFormTitle,
  setFormSlug,
  setFormPrice,
  setFormBadge,
  setFormMaterial,
  setFormMadeIn,
  setFormDesc,
  setFormFeatured,
  setFormStatus,
  autoSlug,
  saveDetails,
}: DetailsTabProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <label className="text-sm font-semibold">Title</label>
        <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold">Slug</label>
        <div className="flex gap-2">
          <Input value={formSlug} onChange={(e) => setFormSlug(e.target.value)} />
          <Button type="button" variant="secondary" onClick={autoSlug}>
            Auto
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold">Price (USD)</label>
        <Input value={formPrice} onChange={(e) => setFormPrice(e.target.value)} />
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Current: {centsToMoney(detail.price_cents, detail.currency)}
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold">Badge (optional)</label>
        <Input value={formBadge} onChange={(e) => setFormBadge(e.target.value)} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold">Material (optional)</label>
        <Input
          value={formMaterial}
          onChange={(e) => setFormMaterial(e.target.value)}
          placeholder="e.g., 50% Cotton / 50% Polyester"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold">Made In (optional)</label>
        <Input
          value={formMadeIn}
          onChange={(e) => setFormMadeIn(e.target.value)}
          placeholder="e.g., USA, China"
        />
      </div>

      <div className="md:col-span-2 space-y-2">
        <label className="text-sm font-semibold">Description</label>
        <Textarea
          value={formDesc}
          onChange={(e) => setFormDesc(e.target.value)}
          className="min-h-[120px]"
        />
      </div>

      <div className="flex items-center gap-3">
        <input
          id="featured"
          type="checkbox"
          checked={formFeatured}
          onChange={(e) => setFormFeatured(e.target.checked)}
        />
        <label htmlFor="featured" className="text-sm font-semibold">
          Featured
        </label>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold">Status</label>
        <div className="flex gap-2 flex-wrap">
          {(["draft", "active", "archived"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`px-3 py-1 rounded-full border text-sm ${
                formStatus === s
                  ? "border-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary))]"
                  : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              }`}
              onClick={() => setFormStatus(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="md:col-span-2">
        <Button onClick={saveDetails} disabled={saving}>
          {saving ? "Saving…" : "Save Details"}
        </Button>
      </div>
    </div>
  );
}