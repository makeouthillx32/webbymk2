import React from "react";
import { ACTIVE_THEME } from "../../theme";

export function TankBrandBlock() {
  return (
    <div
      className="flex min-h-[54px] min-w-0 items-center px-5"
      aria-label="Tank"
    >
      <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-[#ff3b2f] shadow-[0_0_8px_rgba(255,59,47,.8)]" />
      <span
        className="ml-2 truncate text-2xl font-black uppercase tracking-[.08em] text-[#241f14]"
        style={{
          fontFamily: ACTIVE_THEME.fonts.display,
          textShadow:
            "0 1px 0 rgba(255,255,255,.5), 0 2px 3px rgba(0,0,0,.25)",
        }}
      >
        Tank
      </span>
    </div>
  );
}
