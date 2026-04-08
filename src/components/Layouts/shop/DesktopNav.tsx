"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { NavNode as UnifiedNavNode } from "@/lib/navigation";
import "./_components/Desktop.scss";

// Simplified nav node for desktop rendering
type NavNode = {
  key: string;
  label: string;
  href: string;
  routeType: "real" | "hash";
  children?: NavNode[];
};

/**
 * Transform unified nav nodes to desktop-friendly format
 * Only keep categories and collections
 */
function transformNavTree(nodes: UnifiedNavNode[]): NavNode[] {
  return nodes
    .filter((node) => {
      // Only show categories and collections in desktop nav
      return node.type === "category" || node.type === "collection";
    })
    .map((node) => ({
      key: node.key,
      label: node.label,
      href: node.href,
      routeType: node.routeType,
      children: node.children
        ? node.children
            .filter((child) => child.type === "category" || child.type === "collection")
            .map((child) => ({
              key: child.key,
              label: child.label,
              href: child.href,
              routeType: child.routeType,
              // Include grandchildren for desktop mega menu
              children: child.children
                ? child.children
                    .filter((gc) => gc.type === "category" || gc.type === "collection")
                    .map((gc) => ({
                      key: gc.key,
                      label: gc.label,
                      href: gc.href,
                      routeType: gc.routeType,
                    }))
                : undefined,
            }))
        : undefined,
    }));
}

export default function DesktopNav() {
  const [navTree, setNavTree] = useState<NavNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);

  const navRefs = useRef<(HTMLElement | null)[]>([]);
  const dropdownRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Fetch navigation tree from API
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/navigation/tree", {
          cache: "no-store",
          next: { revalidate: 300 }, // 5 minutes
        });

        if (!res.ok) {
          console.error("Navigation fetch failed:", res.status);
          setLoading(false);
          return;
        }

        const json = await res.json();

        if (!json?.nodes) {
          console.error("Invalid navigation response:", json);
          setLoading(false);
          return;
        }

        const transformed = transformNavTree(json.nodes);

        if (!cancelled) {
          setNavTree(transformed);
          setLoading(false);
        }
      } catch (e) {
        console.error("Navigation fetch error:", e);
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const getDropdownAlignment = (index: number) => {
    if (typeof window === "undefined") return "dropdown-align-center";
    const navItem = navRefs.current[index];
    if (!navItem) return "dropdown-align-center";

    const rect = navItem.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    if (rect.right > viewportWidth - 200) return "dropdown-align-right";
    if (rect.left < 200) return "dropdown-align-left";
    return "dropdown-align-center";
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const isClickInsideNav = navRefs.current.some((ref) =>
        ref?.contains(event.target as Node)
      );
      const isClickInsideDropdown = dropdownRefs.current.some((ref) =>
        ref?.contains(event.target as Node)
      );

      if (!isClickInsideNav && !isClickInsideDropdown) {
        setOpenKey(null);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMouseEnter = (key: string) => {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    setOpenKey(key);
  };

  const handleMouseLeave = () => {
    const timeout = setTimeout(() => setOpenKey(null), 150);
    setHoverTimeout(timeout);
  };

  const handleDropdownMouseEnter = () => {
    if (hoverTimeout) clearTimeout(hoverTimeout);
  };

  const handleDropdownMouseLeave = () => {
    const timeout = setTimeout(() => setOpenKey(null), 100);
    setHoverTimeout(timeout);
  };

  const handleNavClick = (hasChildren: boolean) => (e: React.MouseEvent) => {
    if (hasChildren) {
      e.preventDefault();
    } else {
      // Link component will handle navigation
      setOpenKey(null);
    }
  };

  const handleSubmenuClick = () => {
    setOpenKey(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number, key: string) => {
    const node = navTree[index];
    if (!node) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (node.children?.length) {
          setOpenKey(node.key);
          setTimeout(() => {
            const firstItem = document.querySelector(
              `[data-parent="${node.key}"] a`
            ) as HTMLElement | null;
            firstItem?.focus();
          }, 10);
        }
        break;

      case "ArrowRight": {
        e.preventDefault();
        const nextIndex = index < navTree.length - 1 ? index + 1 : 0;
        navRefs.current[nextIndex]?.focus();
        break;
      }

      case "ArrowLeft": {
        e.preventDefault();
        const prevIndex = index > 0 ? index - 1 : navTree.length - 1;
        navRefs.current[prevIndex]?.focus();
        break;
      }

      case "Escape":
        e.preventDefault();
        setOpenKey(null);
        break;

      case "Enter":
      case " ":
        if (node.children?.length) {
          e.preventDefault();
          setOpenKey(openKey === key ? null : key);
        }
        break;
    }
  };

  useEffect(() => {
    return () => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
    };
  }, [hoverTimeout]);

  if (loading) {
    return (
      <nav className="nav-container" aria-label="Primary">
        <div className="nav-menu">
          <div className="text-sm">Loading...</div>
        </div>
      </nav>
    );
  }

  if (navTree.length === 0) {
    return (
      <nav className="nav-container" aria-label="Primary">
        <div className="nav-menu">
          <div className="text-sm">No navigation available</div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="nav-container" aria-label="Primary">
      <div className="nav-menu">
        {navTree.map((node, index) => (
          <div
            key={node.key}
            className="nav-item relative"
            onMouseEnter={() => node.children?.length && handleMouseEnter(node.key)}
            onMouseLeave={node.children?.length ? handleMouseLeave : undefined}
          >
            {node.children?.length ? (
              <>
                <button
                  ref={(el) => {
                    navRefs.current[index] = el;
                  }}
                  className="nav-top-link"
                  onClick={handleNavClick(true)}
                  onKeyDown={(e) => handleKeyDown(e, index, node.key)}
                  aria-expanded={openKey === node.key}
                  aria-haspopup="true"
                  tabIndex={0}
                  data-state={openKey === node.key ? "open" : "closed"}
                  type="button"
                >
                  {node.label}
                  <span
                    className={`ml-1 inline-flex items-center transition-transform duration-200 ${
                      openKey === node.key ? "rotate-180" : "rotate-0"
                    }`}
                    aria-hidden="true"
                  >
                    <ChevronDown size={14} strokeWidth={1.75} />
                  </span>
                </button>

                <div
                  ref={(el) => {
                    dropdownRefs.current[index] = el;
                  }}
                  className={`nav-dropdown bg-[var(--lt-bg)] border-[var(--lt-border)] ${getDropdownAlignment(
                    index
                  )}`}
                  data-state={openKey === node.key ? "open" : "closed"}
                  data-parent={node.key}
                  onMouseEnter={handleDropdownMouseEnter}
                  onMouseLeave={handleDropdownMouseLeave}
                  role="menu"
                  aria-label={`${node.label} submenu`}
                >
                  <div className="p-2">
                    {node.children.map((child) => (
                      <React.Fragment key={child.key}>
                        {child.routeType === "hash" ? (
                          <a
                            href={child.href}
                            onClick={handleSubmenuClick}
                            className="nav-sub-link"
                            role="menuitem"
                            tabIndex={openKey === node.key ? 0 : -1}
                          >
                            {child.label}
                          </a>
                        ) : (
                          <Link
                            href={child.href}
                            onClick={handleSubmenuClick}
                            className="nav-sub-link"
                            role="menuitem"
                            tabIndex={openKey === node.key ? 0 : -1}
                          >
                            {child.label}
                          </Link>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                {node.routeType === "hash" ? (
                  <a
                    ref={(el) => {
                      navRefs.current[index] = el;
                    }}
                    href={node.href}
                    onClick={handleNavClick(false)}
                    className="nav-top-link"
                    onKeyDown={(e) => handleKeyDown(e, index, node.key)}
                    tabIndex={0}
                  >
                    {node.label}
                  </a>
                ) : (
                  <Link
                    ref={(el) => {
                      navRefs.current[index] = el;
                    }}
                    href={node.href}
                    onClick={handleNavClick(false)}
                    className="nav-top-link"
                    onKeyDown={(e) => handleKeyDown(e, index, node.key)}
                    tabIndex={0}
                  >
                    {node.label}
                  </Link>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}