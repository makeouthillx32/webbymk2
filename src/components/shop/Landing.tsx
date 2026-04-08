// components/shop/Landing.tsx
"use client";

import { useEffect, useState } from "react";
import { SectionComponents, type SectionRow } from "./sections/SectionRegistry";
import { LandingSkeleton } from "./_components/LandingSkeleton";
import useThemeCookie from "@/lib/useThemeCookie";

export default function HomePage() {
  // Logic migrated from Home.tsx to keep page.tsx a Server Component
  useThemeCookie();

  const [sections, setSections] = useState<SectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Handle smooth scrolling for hash links (e.g., #contact)
    const scrollToHash = () => {
      const id = window.location.hash.replace("#", "");
      if (!id) return;

      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };

    scrollToHash();
    window.addEventListener("hashchange", scrollToHash);

    // Fetch landing page sections
    async function fetchSections() {
      try {
        const res = await fetch('/api/landing/sections');
        
        if (!res.ok) {
          throw new Error(`Failed to fetch sections: ${res.statusText}`);
        }
        
        const data = await res.json();
        setSections(data.sections || []);
      } catch (err: any) {
        console.error('[Landing] Error fetching sections:', err);
        setError(err.message || 'Failed to load page sections');
      } finally {
        setLoading(false);
      }
    }
    
    fetchSections();

    return () => window.removeEventListener("hashchange", scrollToHash);
  }, []);

  if (loading) {
    return <LandingSkeleton />;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-[var(--foreground)] mb-2">
            Oops! Something went wrong
          </h2>
          <p className="text-[var(--muted-foreground)]">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-hidden">
      <div className="bg-background text-foreground">
        {sections
          .filter(s => s.is_active)
          .sort((a, b) => a.position - b.position)
          .map((section) => {
            const Component = SectionComponents[section.type];
            
            if (!Component) {
              console.warn(`[Landing] Unknown section type: ${section.type}`);
              return null;
            }
            
            return (
              <Component 
                key={section.id} 
                section={section}
              />
            );
          })}
        
        {sections.length === 0 && (
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-[var(--foreground)] mb-2">
                No sections configured
              </h2>
              <p className="text-[var(--muted-foreground)]">
                Add sections in your dashboard to build your landing page
              </p>
            </div>
          </div>
        )}

        <div className="pb-10" />
      </div>
    </div>
  );
}