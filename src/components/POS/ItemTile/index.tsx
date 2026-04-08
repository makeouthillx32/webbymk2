// components/POS/ItemTile/index.tsx
"use client";

import Image from "next/image";
import "./styles.scss";

export interface ItemTileProps {
  label: string;
  sublabel?: string | null;
  imageUrl?: string | null;
  price?: number | null;       // cents
  badge?: string | null;
  badgeVariant?: "default" | "warning" | "danger" | "success";
  isActive?: boolean;
  isDisabled?: boolean;
  icon?: React.ReactNode;
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
}

function fmtPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ItemTile({
  label,
  sublabel,
  imageUrl,
  price,
  badge,
  badgeVariant = "default",
  isActive = false,
  isDisabled = false,
  icon,
  onClick,
  size = "md",
}: ItemTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className={`
        item-tile
        item-tile--${size}
        ${isActive ? "item-tile--active" : ""}
        ${isDisabled ? "item-tile--disabled" : ""}
      `}
    >
      {/* Image or icon area */}
      <div className="item-tile__media">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={label}
            fill
            className="item-tile__img"
            sizes="(max-width: 640px) 120px, 160px"
          />
        ) : icon ? (
          <div className="item-tile__icon">{icon}</div>
        ) : (
          <div className="item-tile__placeholder">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" opacity="0.2">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 14H6v-2h12v2zm0-4H6v-2h12v2zm0-4H6V7h12v2z"/>
            </svg>
          </div>
        )}

        {/* Badge */}
        {badge && (
          <span className={`item-tile__badge item-tile__badge--${badgeVariant}`}>
            {badge}
          </span>
        )}
      </div>

      {/* Label area */}
      <div className="item-tile__info">
        <span className="item-tile__label">{label}</span>
        {sublabel && <span className="item-tile__sublabel">{sublabel}</span>}
        {price != null && (
          <span className="item-tile__price">{fmtPrice(price)}</span>
        )}
      </div>
    </button>
  );
}