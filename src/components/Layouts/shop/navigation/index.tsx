// components/Layouts/shop/navigation/index.tsx
"use client";

import React, { useState, useRef, useEffect } from "react";
import { MdExpandMore, MdChevronRight } from "react-icons/md";
import { ChevronDown, X } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/app/provider";
import type { NavNode as UnifiedNavNode } from "@/lib/navigation";
import "./navigation.scss"; // Fixed path based on your directory structure

type NavNode = {
  key: string;
  label: string;
  href: string;
  routeType: "real" | "hash";
  children?: NavNode[];
};

interface NavigationProps {
  isOpen: boolean;
  onClose: () => void;
}

function transformTree(nodes: UnifiedNavNode[]): NavNode[] {
  return nodes
    .filter((n) => n.type === "category" || n.type === "collection")
    .map((node) => ({
      key: node.key,
      label: node.label,
      href: node.href,
      routeType: node.routeType,
      children: node.children
        ?.filter((c) => c.type === "category" || c.type === "collection")
        .map((child) => ({
          key: child.key,
          label: child.label,
          href: child.href,
          routeType: child.routeType,
          children: child.children
            ?.filter((gc) => gc.type === "category" || gc.type === "collection")
            .map((gc) => ({
              key: gc.key,
              label: gc.label,
              href: gc.href,
              routeType: gc.routeType,
            })),
        })),
    }));
}

export function Navigation({ isOpen, onClose }: NavigationProps) {
  const { session, refreshSession } = useAuth();
  const [navTree, setNavTree] = useState<NavNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const hoverTimeout = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleAuthChange = (e: Event) => {
      const { event } = (e as CustomEvent).detail;
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") refreshSession();
    };
    window.addEventListener("supabase-auth-change", handleAuthChange);
    return () => window.removeEventListener("supabase-auth-change", handleAuthChange);
  }, [refreshSession]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/navigation/tree", { cache: "no-store" });
        const json = await res.json();
        if (json?.nodes) setNavTree(transformTree(json.nodes));
      } catch (e) {
        console.error("Navigation Error:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleLinkClick = () => {
    setActiveDropdown(null);
    setExpandedKey(null);
    onClose();
  };

  const handleHover = (key: string | null) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    if (key) {
      setActiveDropdown(key);
    } else {
      hoverTimeout.current = setTimeout(() => setActiveDropdown(null), 150);
    }
  };

  if (loading) return null;

  return (
    <nav 
      ref={containerRef} 
      className={`nav-shell ${isOpen ? "is-open" : "is-collapsed"}`}
    >
      <div className="nav-topbar">
        <button onClick={onClose} className="nav-close-trigger">
          <X size={24} />
        </button>
      </div>

      <div className="nav-main-content">
        <ul className="nav-list">
          {navTree.map((node) => (
            <li 
              key={node.key} 
              className="nav-item"
              onMouseEnter={() => handleHover(node.key)}
              onMouseLeave={() => handleHover(null)}
            >
              <div className="nav-item-header">
                <Link 
                  href={node.href} 
                  className="nav-link-main" 
                  onClick={handleLinkClick}
                >
                  {node.label}
                </Link>

                {node.children && (
                  <>
                    <button 
                      className="nav-expand-trigger"
                      onClick={() => setExpandedKey(expandedKey === node.key ? null : node.key)}
                    >
                      {expandedKey === node.key ? <MdExpandMore size={22} /> : <MdChevronRight size={22} />}
                    </button>
                    <ChevronDown className="nav-dropdown-icon" size={14} />
                  </>
                )}
              </div>

              {node.children && (
                <div className={`nav-submenu ${expandedKey === node.key || activeDropdown === node.key ? "is-visible" : ""}`}>
                  <div className="nav-submenu-inner">
                    {node.children.map((child) => (
                      <div key={child.key} className="nav-submenu-group">
                        <Link 
                          href={child.href} 
                          className="nav-link-sub"
                          onClick={handleLinkClick}
                        >
                          {child.label}
                        </Link>
                        
                        {child.children?.map((gc) => (
                          <Link 
                            key={gc.key} 
                            href={gc.href} 
                            className="nav-link-grandchild"
                            onClick={handleLinkClick}
                          >
                            {gc.label}
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        <div className="nav-footer-auth">
          {!session ? (
            <Link href="/sign-in" className="nav-auth-link" onClick={handleLinkClick}>
              Sign In
            </Link>
          ) : (
            <Link href="/profile/me" className="nav-auth-link" onClick={handleLinkClick}>
              Account
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}