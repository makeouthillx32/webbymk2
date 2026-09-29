"use client";

import { useIsMobile } from "@/hooks/use-mobile";
import { createContext, useContext, useEffect, useState } from "react";

type SidebarState = "expanded" | "collapsed";

type SidebarContextType = {
  state: SidebarState;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = createContext<SidebarContextType | null>(null);

export function useSidebarContext() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebarContext must be used within a SidebarProvider");
  }
  return context;
}

/** Per-viewer preference; never read back by the server. */
const SIDEBAR_STORAGE_KEY = "dashboard:sidebar-open";

export function SidebarProvider({
  children,
  defaultOpen = true,
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const isMobile = useIsMobile();

  useEffect(() => {
    // Mobile always starts closed — the sidebar covers the page there.
    if (isMobile) {
      setIsOpen(false);
      return;
    }

    // Desktop honours what the user last chose. This branch used to force
    // setIsOpen(true) unconditionally, which meant a collapse could not
    // survive anything that re-ran the effect, and nothing was stored anyway.
    try {
      const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      setIsOpen(saved === null ? true : saved === "1");
    } catch {
      // Private windows and blocked site data throw on access rather than
      // returning null; default to open rather than failing to render.
      setIsOpen(true);
    }
  }, [isMobile]);

  function toggleSidebar() {
    setIsOpen((prev) => {
      const next = !prev;
      // Only desktop persists: mobile is a transient overlay, and remembering
      // it open would hide the page on the next visit.
      if (!isMobile) {
        try {
          window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
        } catch {
          /* storage unavailable — the toggle still works for this session */
        }
      }
      return next;
    });
  }

  return (
    <SidebarContext.Provider
      value={{
        state: isOpen ? "expanded" : "collapsed",
        isOpen,
        setIsOpen,
        isMobile,
        toggleSidebar,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}
