// lib/blog/parseDra.ts
// .dra parser — mirrors scripts/post_dra.py so a draft dropped on the dashboard
// editor behaves exactly like one pushed through the ingest API:
//   • YAML frontmatter → form fields (title, slug, excerpt, author, tags, …)
//   • local image refs (./file.png) → predictable post://image-N slots
//   • cover: ./file.png → the post://cover slot
//   • [[slug]] / [[slug|label]] wiki-links → real blog links
// Localization: `--- de ---` on its own line splits EN body from DE body;
// title_de / excerpt_de come from frontmatter.
//
// Pure — no DOM, no Supabase. Usable from the dashboard, a route handler, or a
// script that ingests drafts on the agent's behalf.

import { slugify } from "@/utils/slug";
import { BLOG_ORIGIN, COVER_SLOT, IMAGE_SLOT_PREFIX, POST_REF_SCHEME } from "./constants";

export interface DraSlotFile {
  slot: string; // "cover" | "image-1" | …
  localName: string; // basename of the referenced local file, for matching drops
}

export interface ParsedDra {
  title: string;
  titleDe: string;
  slug: string;
  excerpt: string;
  excerptDe: string;
  author: string | null;
  tags: string[];
  cover: string | null; // "post://cover" | https URL | null
  publish: boolean;
  publishedAt: string | null;
  content: string;
  contentDe: string;
  slotFiles: DraSlotFile[]; // local files the author must supply (drop or slot-upload)
}

function basename(p: string): string {
  return p.replace(/^\.\//, "").split(/[\\/]/).pop() ?? p;
}

function unquote(v: string): string {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/** Minimal flat-YAML reader: `key: value` lines + inline lists `[a, b]`. */
function parseFrontmatter(block: string): Record<string, string | string[] | boolean> {
  const out: Record<string, string | string[] | boolean> = {};
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    // strip trailing YAML comments (— but not inside quotes)
    if (!value.startsWith('"') && !value.startsWith("'")) {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    if (value.startsWith("[") && value.endsWith("]")) {
      out[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => unquote(s))
        .filter(Boolean);
    } else if (/^(true|false)$/i.test(value)) {
      out[key] = value.toLowerCase() === "true";
    } else {
      out[key] = unquote(value);
    }
  }
  return out;
}

function isExternal(ref: string): boolean {
  return /^(https?:\/\/|post:\/\/|data:|\/)/.test(ref.trim());
}

/** [[slug]] / [[slug|label]] → [label](https://blog.unenter.live/slug) */
function rewriteWikilinks(text: string): string {
  return text.replace(/\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/gi, (_, slug: string, label?: string) => {
    return `[${label ?? slug}](${BLOG_ORIGIN}/${slug})`;
  });
}

export function parseDra(source: string): ParsedDra {
  const src = source.replace(/^﻿/, "");

  // ── Frontmatter ────────────────────────────────────────────────────────────
  let fm: Record<string, string | string[] | boolean> = {};
  let body = src;
  const fmMatch = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (fmMatch) {
    fm = parseFrontmatter(fmMatch[1]);
    body = src.slice(fmMatch[0].length);
  }

  const title = String(fm.title ?? "").trim();
  if (!title) throw new Error(".dra is missing a `title:` in its frontmatter");

  // ── EN / DE body split (`--- de ---` on its own line) ─────────────────────
  let bodyEn = body;
  let bodyDe = "";
  const deSplit = body.split(/^\s*---\s*de\s*---\s*$/m);
  if (deSplit.length > 1) {
    bodyEn = deSplit[0];
    bodyDe = deSplit.slice(1).join("\n");
  }

  // ── Local image refs → post://image-N slots (document order, EN then DE) ──
  const slotFiles: DraSlotFile[] = [];
  const assigned = new Map<string, string>(); // localName → slot (dedupe repeats)
  let counter = 0;

  const rewriteImages = (text: string) =>
    text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (whole, alt: string, ref: string) => {
      if (isExternal(ref)) return whole;
      const name = basename(ref);
      let slot = assigned.get(name);
      if (!slot) {
        counter += 1;
        slot = `${IMAGE_SLOT_PREFIX}${counter}`;
        assigned.set(name, slot);
        slotFiles.push({ slot, localName: name });
      }
      return `![${alt}](${POST_REF_SCHEME}${slot})`;
    });

  bodyEn = rewriteWikilinks(rewriteImages(bodyEn)).trim();
  bodyDe = rewriteWikilinks(rewriteImages(bodyDe)).trim();

  // ── Cover ──────────────────────────────────────────────────────────────────
  const coverRaw = typeof fm.cover === "string" ? fm.cover.trim() : "";
  let cover: string | null = null;
  if (coverRaw) {
    if (/^https?:\/\//.test(coverRaw) || coverRaw.startsWith(POST_REF_SCHEME)) {
      cover = coverRaw;
    } else {
      cover = `${POST_REF_SCHEME}${COVER_SLOT}`;
      slotFiles.unshift({ slot: COVER_SLOT, localName: basename(coverRaw) });
    }
  }

  const tags = Array.isArray(fm.tags)
    ? fm.tags.map(String).slice(0, 12)
    : typeof fm.tags === "string" && fm.tags
      ? [String(fm.tags)]
      : [];

  return {
    title,
    titleDe: String(fm.title_de ?? ""),
    slug: slugify(String(fm.slug ?? "") || title),
    excerpt: String(fm.excerpt ?? ""),
    excerptDe: String(fm.excerpt_de ?? ""),
    author: typeof fm.author === "string" && fm.author ? String(fm.author) : null,
    tags,
    cover,
    publish: fm.publish === true,
    publishedAt:
      typeof fm.published_at === "string" && fm.published_at ? String(fm.published_at) : null,
    content: bodyEn,
    contentDe: bodyDe,
    slotFiles,
  };
}
