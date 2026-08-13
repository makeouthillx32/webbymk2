// components/Layouts/labs/Footer.tsx
//
// Unenter Labs Zone Footer.
// Compact Labs footer with research, care, account, and policy links.
"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import useLoginSession from "@/lib/useLoginSession";
import { useTheme } from "@/app/provider";

type FooterLink = { name: string; href: string; external?: boolean };
type FooterSection = { title: string; links: FooterLink[] };

export default function Footer() {
  const session = useLoginSession();
  const { themeType } = useTheme();
  const pathname = usePathname();
  const signInHref = `/sign-in?next=${encodeURIComponent(pathname || "/")}`;

  const userId = session?.user?.id;
  const isMember = !!userId;

  const sections: FooterSection[] = useMemo(() => {
    const base: FooterSection[] = [
      {
        title: "Research",
        links: [
          { name: "Search Catalog", href: "/search" },
          { name: "Peptides & Blends", href: "/search?category=peptides" },
          { name: "Lab Supplies", href: "/search?category=lab-supplies" },
          { name: "Wholesale Application", href: "/wholesale-application" },
        ],
      },
      {
        title: "Customer Care",
        links: [
          { name: "Contact Support", href: "/contact" },
          { name: "Shipping Policy", href: "/pages/shipping" },
          { name: "Returns & Exchanges", href: "/pages/returns" },
        ],
      },
      {
        title: "About",
        links: [
          { name: "Our Story", href: "/pages/about" },
          { name: "FAQs", href: "/pages/faq" },
          { name: "Privacy Policy", href: "/pages/privacy-policy" },
          { name: "Terms & Conditions", href: "/pages/terms-and-conditions" },
        ],
      },
    ];

    if (!isMember) {
      return [
        {
          title: "Account",
          links: [
            { name: "Sign In", href: signInHref },
            { name: "Create Account", href: "/sign-up" },
          ],
        },
        ...base,
      ];
    }

    const member: FooterSection[] = [
      {
        title: "Your Account",
        links: [
          { name: "Account Dashboard", href: "/profile/me" },
          { name: "Orders", href: "/profile/me/orders" },
          { name: "Saved Compounds", href: "/profile/me/saved" },
          { name: "Sign Out", href: "/auth/logout" },
        ],
      },
      ...base,
    ];

    return member;
  }, [isMember, signInHref]);

  return (
    <footer
      data-layout="footer"
      data-zone="labs"
      className="border-t border-[var(--lt-border)] bg-[var(--lt-bg)] text-[var(--lt-fg)]"
    >
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-8 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_2fr] lg:gap-12">
          {/* Brand & Research Notice */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <img
                src={
                  themeType === "dark"
                    ? "/images/home/dartlogowhite.svg"
                    : "/images/home/dartlogo.svg"
                }
                alt="UNENTER"
                className="h-9 w-auto"
              />
              <span className="border-l border-[hsl(var(--border))] pl-2 text-xs font-black uppercase tracking-[0.2em] text-[hsl(var(--primary))]">
                Labs
              </span>
            </div>

            <p className="max-w-[30rem] text-xs leading-relaxed text-[hsl(var(--muted-foreground))] sm:text-sm">
              Unenter Labs delivers third-party tested research peptides and
              compounds with 100% HPLC and mass-spectrometry certified batch
              transparency.
            </p>

            <div className="inline-flex max-w-sm items-center gap-2 rounded-xl border border-[hsl(var(--primary))/0.2] bg-[hsl(var(--primary))/0.1] p-3 text-xs font-bold text-[hsl(var(--primary))]">
              <ShieldCheck size={18} className="shrink-0" />
              <span>
                For Laboratory & Research Use Only. Not for Human Consumption.
              </span>
            </div>
          </div>

          {/* Links Grid: 2-Column Mobile Grid Matching Explore Catalog */}
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
            {sections.map((section) => (
              <div key={section.title}>
                <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-[hsl(var(--foreground))] sm:text-sm">
                  {section.title}
                </h3>
                <ul className="space-y-2.5 text-xs text-[hsl(var(--muted-foreground))] sm:text-sm">
                  {section.links.map((link) => (
                    <li key={link.name}>
                      {link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-[hsl(var(--primary))] transition-colors hover:text-[hsl(var(--foreground))]"
                        >
                          {link.name}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="font-medium transition-colors hover:text-[hsl(var(--foreground))]"
                        >
                          {link.name}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Legal Bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-[hsl(var(--border))] pt-6 text-xs text-[hsl(var(--muted-foreground))] sm:flex-row">
          <p>© {new Date().getFullYear()} Unenter Labs. All rights reserved.</p>
          <div className="flex flex-wrap gap-4">
            <Link className="hover:underline" href="/pages/privacy-policy">
              Privacy Policy
            </Link>
            <Link
              className="hover:underline"
              href="/pages/terms-and-conditions"
            >
              Terms & Conditions
            </Link>
            <Link className="hover:underline" href="/contact">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
