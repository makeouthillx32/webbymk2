// src/zones/docs/markdown.ts
// ─────────────────────────────────────────────────────────────────────────────
// Markdown-driven docs engine for the Docs zone.
//
// Drop a .md file into  src/zones/docs/content/  and it becomes a page at
// /<filename-without-extension> — listed automatically on the landing page.
//
// Frontmatter (all optional):
//   title:   page title            (falls back to the slug)
//   summary: one-line description  (shown on landing cards + meta description)
//   order:   number for sorting    (falls back to alphabetical)
//
// Server-only: uses fs at build time (pages are statically generated).
// ─────────────────────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";

export type DocMeta = {
  slug: string;
  title: string;
  summary: string;
  order: number;
};

export type Doc = DocMeta & { html: string };

const CONTENT_DIR = path.join(process.cwd(), "src", "zones", "docs", "content");

function parseFrontmatter(raw: string): {
  data: Record<string, string>;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    data[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { data, body: raw.slice(match[0].length) };
}

export function listDocs(): DocMeta[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  const docs = files.map((file) => {
    const slug = file.replace(/\.md$/, "");
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), "utf8");
    const { data } = parseFrontmatter(raw);
    return {
      slug,
      title: data.title ?? slug,
      summary: data.summary ?? "",
      order: Number.isFinite(Number(data.order)) ? Number(data.order) : 999,
    };
  });
  return docs.sort(
    (a, b) => a.order - b.order || a.title.localeCompare(b.title),
  );
}

export function getDoc(slug: string): Doc | null {
  // Guard against path traversal — slugs are plain filenames only.
  if (!/^[a-z0-9-]+$/i.test(slug)) return null;
  const file = path.join(CONTENT_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const { data, body } = parseFrontmatter(raw);
  const html = marked.parse(body, { async: false }) as string;
  return {
    slug,
    title: data.title ?? slug,
    summary: data.summary ?? "",
    order: Number.isFinite(Number(data.order)) ? Number(data.order) : 999,
    html,
  };
}
