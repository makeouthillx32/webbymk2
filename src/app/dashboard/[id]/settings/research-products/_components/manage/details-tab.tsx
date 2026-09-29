import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { centsToMoney } from "../utils";
import type { ProductRow } from "../types";

/**
 * The presentation axis, as a closed list.
 *
 * Free text would re-fragment exactly what grouping fixed — "Spray", "spray"
 * and "Nasal Spray" becoming three forms. These are the values derive_form()
 * emits, so a hand correction and an auto-derivation stay comparable.
 */
export const PRODUCT_FORMS = [
  "lyophilized",
  "liquid",
  "spray",
  "capsules",
  "drops",
  "topical",
  "tablet",
  "patch",
  "raw material",
] as const;

interface DetailsTabProps {
  detail: ProductRow;
  formTitle: string;
  formSlug: string;
  formPrice: string;
  formBadge: string;
  formBrand: string;
  formCasNumber: string;
  formPurity: string;
  formCompound: string;
  formPresentation: string;
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
  setFormCompound: (v: string) => void;
  setFormPresentation: (v: string) => void;
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
  formCompound,
  formPresentation,
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
  setFormCompound,
  setFormPresentation,
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

      {/* ── Grouping ─────────────────────────────────────────────────────
          Both were bulk-derived from the title by regex across 751 products,
          so some are wrong. Correcting them here is the only way to fix a card
          that grouped badly — and a hand-set value is never re-derived. */}
      <div className="space-y-2 rounded-md border border-[hsl(var(--border))] p-3">
        <div>
          <p className="text-sm font-semibold">Grouping</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Auto-detected from the title. Fix either if it guessed wrong; clear a field to
            re-detect it.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold">Compound</label>
            <Input
              value={formCompound}
              placeholder="e.g. BPC-157"
              onChange={(e) => setFormCompound(e.target.value)}
            />
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
              The substance, without dose or form. Products sharing this share one inventory card.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold">Form</label>
            <select
              value={formPresentation}
              onChange={(e) => setFormPresentation(e.target.value)}
              className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
            >
              <option value="">Auto-detect from title</option>
              {PRODUCT_FORMS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
              How it ships. Unmarked titles default to lyophilized, which is why some are wrong.
            </p>
          </div>
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