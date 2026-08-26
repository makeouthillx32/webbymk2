export type SeasonPassVariant = "get" | "required";

export type BillingCycle = "monthly" | "six_months";

export type SeasonPassTier = "standard" | "xl";

export type SeasonPassOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
  variant?: SeasonPassVariant;
  onSelectTier?: (tier: SeasonPassTier, billing: BillingCycle) => void;
  onOpenProducerLounge?: () => void;
};
