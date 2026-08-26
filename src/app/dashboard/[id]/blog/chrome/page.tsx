// app/dashboard/[id]/blog/chrome/page.tsx
// Blog chrome manager: header nav, footer columns, promo/ad banner and
// newsletter band for blog.unenter.live — all stored in blog_settings.
"use client";

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { BlogImageUploader } from "../_components/BlogImageUploader";

interface LinkItem { label: string; url: string }
interface Column   { title: string; links: LinkItem[] }

interface Settings {
  header: {
    wordmark: string;
    show_rss: boolean;
    links: LinkItem[];
    cta: { label: string; url: string; enabled: boolean };
  };
  footer: {
    cta_banner: { enabled: boolean; text: string; url: string; image: string | null };
    columns: Column[];
    copyright: string;
  };
  promo: { enabled: boolean; title: string; url: string; image: string | null };
  newsletter: { enabled: boolean; heading: string; body: string; success: string };
}

async function readJson(res: Response) {
  try { return await res.json(); } catch { return null; }
}

const input =
  "w-full rounded border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-1 focus:ring-primary";
const label = "mb-1 block text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]";

function LinkListEditor({
  links,
  onChange,
}: {
  links: LinkItem[];
  onChange: (links: LinkItem[]) => void;
}) {
  return (
    <div className="space-y-2">
      {links.map((l, i) => (
        <div key={i} className="flex gap-2">
          <input
            className={input}
            value={l.label}
            placeholder="Label"
            onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
          />
          <input
            className={input}
            value={l.url}
            placeholder="https://…"
            onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
          />
          <button
            onClick={() => onChange(links.filter((_, j) => j !== i))}
            className="shrink-0 px-2 text-sm text-[hsl(var(--destructive))]"
            aria-label="Remove link"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...links, { label: "", url: "" }])}
        className="text-sm font-medium text-primary hover:underline"
      >
        + Add link
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 md:p-6">
      <h2 className="mb-4 text-base font-semibold text-[hsl(var(--foreground))]">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export default function BlogChromePage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    fetch("/api/blog/admin/settings").then(readJson).then((j) => {
      if (j?.ok) setSettings(j.data as Settings);
      else toast.error(j?.error?.message ?? "Failed to load settings");
    });
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const j = await fetch("/api/blog/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    }).then(readJson);
    setSaving(false);
    if (j?.ok) toast.success("Blog chrome saved");
    else toast.error(j?.error?.message ?? "Save failed");
  };

  if (!settings) {
    return <p className="p-8 text-sm text-[hsl(var(--muted-foreground))]">Loading…</p>;
  }

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => (s ? { ...s, [key]: value } : s));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Blog Chrome</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Header, footer, promo banner and newsletter band for blog.unenter.live.
          </p>
        </div>
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save all"}</Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Header */}
        <Section title="Header">
          <div>
            <label className={label}>Wordmark</label>
            <input
              className={input}
              value={settings.header.wordmark}
              onChange={(e) => set("header", { ...settings.header, wordmark: e.target.value })}
            />
          </div>
          <div>
            <label className={label}>Nav links</label>
            <LinkListEditor
              links={settings.header.links}
              onChange={(links) => set("header", { ...settings.header, links })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label}>CTA label</label>
              <input
                className={input}
                value={settings.header.cta.label}
                onChange={(e) => set("header", { ...settings.header, cta: { ...settings.header.cta, label: e.target.value } })}
              />
            </div>
            <div>
              <label className={label}>CTA URL</label>
              <input
                className={input}
                value={settings.header.cta.url}
                onChange={(e) => set("header", { ...settings.header, cta: { ...settings.header.cta, url: e.target.value } })}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
            <input
              type="checkbox"
              checked={settings.header.cta.enabled}
              onChange={(e) => set("header", { ...settings.header, cta: { ...settings.header.cta, enabled: e.target.checked } })}
            />
            Show CTA button
          </label>
        </Section>

        {/* Promo */}
        <Section title="Promo / Ad banner (between index sections)">
          <label className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
            <input
              type="checkbox"
              checked={settings.promo.enabled}
              onChange={(e) => set("promo", { ...settings.promo, enabled: e.target.checked })}
            />
            Enabled
          </label>
          <div>
            <label className={label}>Title</label>
            <input
              className={input}
              value={settings.promo.title}
              onChange={(e) => set("promo", { ...settings.promo, title: e.target.value })}
            />
          </div>
          <div>
            <label className={label}>Link URL</label>
            <input
              className={input}
              value={settings.promo.url}
              onChange={(e) => set("promo", { ...settings.promo, url: e.target.value })}
            />
          </div>
          <div>
            <label className={label}>Banner image (optional, replaces arrow)</label>
            {settings.promo.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.promo.image} alt="" className="mb-2 h-16 rounded object-cover" />
            )}
            <BlogImageUploader
              postId={null}
              label="Upload banner"
              onUploaded={(url) => set("promo", { ...settings.promo, image: url })}
            />
            {settings.promo.image && (
              <button
                onClick={() => set("promo", { ...settings.promo, image: null })}
                className="mt-1 text-xs text-[hsl(var(--destructive))] hover:underline"
              >
                Remove image
              </button>
            )}
          </div>
        </Section>

        {/* Footer */}
        <Section title="Footer">
          <div className="rounded border border-[hsl(var(--border))] p-3">
            <label className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
              <input
                type="checkbox"
                checked={settings.footer.cta_banner.enabled}
                onChange={(e) => set("footer", { ...settings.footer, cta_banner: { ...settings.footer.cta_banner, enabled: e.target.checked } })}
              />
              CTA banner enabled
            </label>
            <div className="mt-2 grid gap-2">
              <input
                className={input}
                placeholder="Banner text"
                value={settings.footer.cta_banner.text}
                onChange={(e) => set("footer", { ...settings.footer, cta_banner: { ...settings.footer.cta_banner, text: e.target.value } })}
              />
              <input
                className={input}
                placeholder="Banner URL"
                value={settings.footer.cta_banner.url}
                onChange={(e) => set("footer", { ...settings.footer, cta_banner: { ...settings.footer.cta_banner, url: e.target.value } })}
              />
            </div>
            <div className="mt-3">
              <label className={label}>Banner image (ad artwork, optional)</label>
              {settings.footer.cta_banner.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.footer.cta_banner.image} alt="" className="mb-2 h-16 rounded object-cover" />
              )}
              <BlogImageUploader
                postId={null}
                label="Upload ad image"
                onUploaded={(url) => set("footer", { ...settings.footer, cta_banner: { ...settings.footer.cta_banner, image: url } })}
              />
              {settings.footer.cta_banner.image && (
                <button
                  onClick={() => set("footer", { ...settings.footer, cta_banner: { ...settings.footer.cta_banner, image: null } })}
                  className="mt-1 text-xs text-[hsl(var(--destructive))] hover:underline"
                >
                  Remove image
                </button>
              )}
            </div>
          </div>

          {settings.footer.columns.map((col, ci) => (
            <div key={ci} className="rounded border border-[hsl(var(--border))] p-3">
              <div className="mb-2 flex items-center gap-2">
                <input
                  className={cn(input, "font-medium")}
                  value={col.title}
                  placeholder="Column title"
                  onChange={(e) =>
                    set("footer", {
                      ...settings.footer,
                      columns: settings.footer.columns.map((c, j) => (j === ci ? { ...c, title: e.target.value } : c)),
                    })
                  }
                />
                <button
                  onClick={() => set("footer", { ...settings.footer, columns: settings.footer.columns.filter((_, j) => j !== ci) })}
                  className="shrink-0 px-2 text-sm text-[hsl(var(--destructive))]"
                >
                  ✕
                </button>
              </div>
              <LinkListEditor
                links={col.links}
                onChange={(links) =>
                  set("footer", {
                    ...settings.footer,
                    columns: settings.footer.columns.map((c, j) => (j === ci ? { ...c, links } : c)),
                  })
                }
              />
            </div>
          ))}
          <button
            onClick={() => set("footer", { ...settings.footer, columns: [...settings.footer.columns, { title: "", links: [] }] })}
            className="text-sm font-medium text-primary hover:underline"
          >
            + Add column
          </button>

          <div>
            <label className={label}>Copyright line</label>
            <input
              className={input}
              value={settings.footer.copyright}
              onChange={(e) => set("footer", { ...settings.footer, copyright: e.target.value })}
            />
          </div>
        </Section>

        {/* Newsletter */}
        <Section title="Newsletter band">
          <label className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
            <input
              type="checkbox"
              checked={settings.newsletter.enabled}
              onChange={(e) => set("newsletter", { ...settings.newsletter, enabled: e.target.checked })}
            />
            Enabled
          </label>
          <div>
            <label className={label}>Heading (last word renders italic)</label>
            <input
              className={input}
              value={settings.newsletter.heading}
              onChange={(e) => set("newsletter", { ...settings.newsletter, heading: e.target.value })}
            />
          </div>
          <div>
            <label className={label}>Body</label>
            <textarea
              className={cn(input, "min-h-[72px]")}
              value={settings.newsletter.body}
              onChange={(e) => set("newsletter", { ...settings.newsletter, body: e.target.value })}
            />
          </div>
          <div>
            <label className={label}>Success message</label>
            <input
              className={input}
              value={settings.newsletter.success}
              onChange={(e) => set("newsletter", { ...settings.newsletter, success: e.target.value })}
            />
          </div>
        </Section>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save all"}</Button>
      </div>
    </div>
  );
}
