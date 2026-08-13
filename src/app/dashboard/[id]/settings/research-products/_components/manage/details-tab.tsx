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
  formBrand: string;
  formCasNumber: string;
  formPurity: string;
  formResearchUseOnly: boolean;
  formDesc: string;
  formFeatured: boolean;
  saving: boolean;
  setFormTitle: (v: string) => void;
  setFormSlug: (v: string) => void;
  setFormPrice: (v: string) => void;
  setFormBadge: (v: string) => void;
  setFormBrand: (v: string) => void;
  setFormCasNumber: (v: string) => void;
  setFormPurity: (v: string) => void;
  setFormResearchUseOnly: (v: boolean) => void;
  setFormDesc: (v: string) => void;
  setFormFeatured: (v: boolean) => void;
  autoSlug: () => void;
  saveDetails: () => void;
}

export function DetailsTab({
  detail,
  formTitle,
  formSlug,
  formPrice,
  formBadge,
  formBrand,
  formCasNumber,
  formPurity,
  formResearchUseOnly,
  formDesc,
  formFeatured,
  saving,
  setFormTitle,
  setFormSlug,
  setFormPrice,
  setFormBadge,
  setFormBrand,
  setFormCasNumber,
  setFormPurity,
  setFormResearchUseOnly,
  setFormDesc,
  setFormFeatured,
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
        <label className="text-sm font-semibold">Brand (optional)</label>
        <Input
          value={formBrand}
          onChange={(e) => setFormBrand(e.target.value)}
          placeholder="e.g., Unenter Labs"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold">CAS Number (optional)</label>
        <Input
          value={formCasNumber}
          onChange={(e) => setFormCasNumber(e.target.value)}
          placeholder="e.g., 12629-01-5"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold">Purity % (optional)</label>
        <Input
          value={formPurity}
          onChange={(e) => setFormPurity(e.target.value)}
          placeholder="e.g., 99.0"
        />
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          General/labeled purity — batch-specific results belong on the Lab Data tab.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <input
          id="researchUseOnly"
          type="checkbox"
          checked={formResearchUseOnly}
          onChange={(e) => setFormResearchUseOnly(e.target.checked)}
        />
        <label htmlFor="researchUseOnly" className="text-sm font-semibold">
          Research use only
        </label>
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

      <div className="md:col-span-2">
        <Button onClick={saveDetails} disabled={saving}>
          {saving ? "Saving…" : "Save Details"}
        </Button>
      </div>
    </div>
  );
}