"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { FaInstagram, FaTiktok } from "react-icons/fa";

import useLoginSession from "@/lib/useLoginSession";
import { useTheme } from "@/app/provider";
import { userRoleCookies } from "@/lib/cookieUtils";

type FooterLink = { name: string; href: string; external?: boolean };
type FooterSection = { title: string; links: FooterLink[] };

const socialLinks = [
  { icon: <FaInstagram className="size-5" />, href: "https://instagram.com/YourPage", label: "Instagram" },
  { icon: <FaTiktok className="size-5" />, href: "https://tiktok.com/@YourPage", label: "TikTok" },
];

export default function Footer() {
  const session = useLoginSession();
  const { themeType } = useTheme();

  const userId = session?.user?.id;
  const cookieRole = userRoleCookies.getUserRole(userId) ?? "guest";

  const isSignedIn = !!userId;
  const role =
    isSignedIn && (cookieRole === "owner" || cookieRole === "admin" || cookieRole === "shopper")
      ? cookieRole
      : "guest";

  const isMember = role === "shopper" || role === "admin" || role === "owner";
  const isOwnerOrAdmin = role === "owner" || role === "admin";

  const sections: FooterSection[] = useMemo(() => {
    // ✅ Always visible baseline
    const base: FooterSection[] = [
      {
        title: "Shop",
        links: [
          { name: "New Releases", href: "/new-releases" },
          { name: "Restocks", href: "/restocks" },

          // ✅ Landing sections
          { name: "Best Sellers", href: "/#best-sellers" },
          { name: "Gift Card", href: "/#gift-card" },
        ],
      },
      {
        title: "Customer Care",
        links: [
          { name: "Contact", href: "/contact" },

          // ✅ CMS-driven pages (Option B) — update to your real slugs if/when they exist
          { name: "Shipping", href: "/pages/shipping" },
          { name: "Returns", href: "/pages/returns" },
          { name: "Size Guide", href: "/pages/size-guide" },
        ],
      },
      {
        title: "About",
        links: [
          // ✅ CMS-driven pages (your real slug)
          { name: "Our Story", href: "/pages/about" },

          // ✅ Landing section
          { name: "FAQs", href: "/pages/faq" },

          // ✅ Legal CMS pages (your real slugs)
          { name: "Privacy Policy", href: "/pages/privacy-policy" },
          { name: "Terms", href: "/pages/terms-and-conditions" },
        ],
      },
    ];

    // ✅ Guests: keep it minimal + sign-in/up only
    if (!isMember) {
      return [
        {
          title: "Account",
          links: [
            { name: "Sign In", href: "/sign-in" },
            { name: "Join the Barn", href: "/sign-up" },
          ],
        },
        ...base,
      ];
    }

    // ✅ Members: add account links
    const member: FooterSection[] = [
      {
        title: "Your Account",
        links: [
          { name: "Account", href: "/profile/me" },
          { name: "Orders", href: "/profile/me/orders" },
          { name: "Saved", href: "/profile/me/saved" },
          { name: "Sign Out", href: "/auth/logout" },
        ],
      },
      ...base,
    ];

    // ✅ Owner/Admin: add admin links
    if (isOwnerOrAdmin) {
      member.push({
        title: "Admin",
        links: [
          { name: "Dashboard", href: "/dashboard/me" },
          { name: "Products", href: "/dashboard/me/settings/products" },
          { name: "Orders", href: "/dashboard/me/orders" },
        ],
      });
    }

    return member;
  }, [isMember, isOwnerOrAdmin]);

  return (
    <footer 
      data-layout="footer" 
      className="bg-[var(--lt-bg)] text-[var(--lt-fg)] border-t border-[var(--lt-border)]"
    >
      <div className="mx-auto max-w-7xl px-6 sm:px-8 md:px-12 lg:px-16 xl:px-20 py-14">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_2fr] lg:gap-14">
          {/* Brand */}
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <img
                src={themeType === "dark" ? "/images/home/dartlogowhite.svg" : "/images/home/dartlogo.svg"}
                alt="Brand Logo"
                className="h-12 w-auto"
              />
            </div>

            <p className="max-w-[32rem] text-sm text-[var(--lt-fg)] opacity-80">
              Desert Cowgirl™ — western essentials, everyday staples, and drops worth waiting for.
            </p>

            {/* Member shoutout */}
            {isMember ? (
              <div className="inline-flex w-fit items-center rounded-full border border-[var(--lt-border)] px-3 py-1 text-xs text-[var(--lt-fg)] opacity-70">
                Thanks for joining the Barn.
              </div>
            ) : (
              <div className="inline-flex w-fit items-center rounded-full border border-[var(--lt-border)] px-3 py-1 text-xs text-[var(--lt-fg)] opacity-70">
                New here?{" "}
                <Link className="ml-1 underline underline-offset-2" href="/sign-up">
                  Join the Barn
                </Link>
              </div>
            )}

            <ul className="flex items-center gap-4 text-[var(--lt-fg)] opacity-70">
              {socialLinks.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    aria-label={s.label}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-full border border-[var(--lt-border)] p-2 hover:bg-[var(--lt-bg)] hover:opacity-80 transition-colors"
                  >
                    {s.icon}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Sections */}
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sections.map((section) => (
              <div key={section.title}>
                <h3 className="mb-4 text-sm font-semibold tracking-wide text-[var(--lt-fg)]">
                  {section.title}
                </h3>
                <ul className="space-y-3 text-sm text-[var(--lt-fg)] opacity-70">
                  {section.links.map((link) => (
                    <li key={link.name} className="hover:text-[var(--lt-fg)] transition-colors">
                      {link.external ? (
                        <a href={link.href} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {link.name}
                        </a>
                      ) : (
                        <Link href={link.href} className="hover:underline">
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

        <div className="mt-12 flex flex-col gap-4 border-t border-[var(--lt-border)] pt-8 text-xs text-[var(--lt-fg)] opacity-60 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} Desert Cowgirl™. All rights reserved.</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link className="hover:underline" href="/legal/privacy-policy">
              Privacy
            </Link>
            <Link className="hover:underline" href="/legal/terms-and-conditions">
              Terms
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