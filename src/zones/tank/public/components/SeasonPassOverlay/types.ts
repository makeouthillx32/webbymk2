export type SeasonPassVariant = "get" | "required";

export type BillingCycle = "monthly" | "six_months";

export type SeasonPassTier = "standard" | "xl";

export type SeasonPassOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
  variant?: SeasonPassVariant;
  onSelectTier?: (tier: SeasonPassTier, billing: BillingCycle) => void;
  /**
   * The tier this viewer already holds, or null if none.
   *
   * Without it the overlay happily sells a base holder a second base pass —
   * Stripe creates a SECOND subscription and charges them twice a month.
   */
  currentTier?: SeasonPassTier | null;
  onOpenProducerLounge?: () => void;
};
