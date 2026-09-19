import { RadioTower } from "lucide-react";
import { SiKick, SiTwitch, SiYoutube } from "react-icons/si";
import type { TankChatProvider } from "../../contracts";

const PROVIDER_META = {
  twitch: { label: "Twitch", color: "#a970ff", Icon: SiTwitch },
  kick: { label: "Kick", color: "#53fc18", Icon: SiKick },
  youtube: { label: "YouTube", color: "#ff3030", Icon: SiYoutube },
  trovo: { label: "Trovo", color: "#19d28f", Icon: RadioTower },
} as const;

export function ExternalChatProviderBadge({
  provider,
  compact = false,
}: {
  provider?: TankChatProvider;
  compact?: boolean;
}) {
  if (!provider || provider === "tank") return null;
  const meta = PROVIDER_META[provider];
  const Icon = meta.Icon;

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded border border-white/15 bg-black/65 px-1 py-0.5 font-black uppercase tracking-wide text-white shadow-sm"
      style={{ color: meta.color, fontSize: compact ? 8 : 9 }}
      title={`${meta.label} chat`}
      aria-label={`${meta.label} chat`}
    >
      <Icon aria-hidden className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {compact ? null : <span>{meta.label}</span>}
    </span>
  );
}
