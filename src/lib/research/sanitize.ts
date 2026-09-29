// src/lib/research/sanitize.ts
// ─────────────────────────────────────────────────────────────────────────────
// Defensive HTML sanitization for database-backed research content.
// Protects against stored-XSS vectors while allowing safe structural markup.
// ─────────────────────────────────────────────────────────────────────────────

import xss from "xss";

const whiteList: Record<string, string[]> = {
  p: ["class"],
  br: [],
  strong: [],
  em: [],
  b: [],
  i: [],
  u: [],
  s: [],
  span: ["class"],
  h1: ["class"],
  h2: ["class"],
  h3: ["class"],
  h4: ["class"],
  h5: ["class"],
  h6: ["class"],
  ul: ["class"],
  ol: ["class"],
  li: ["class"],
  table: ["class"],
  thead: [],
  tbody: [],
  tr: [],
  th: ["class", "colspan", "rowspan"],
  td: ["class", "colspan", "rowspan"],
  blockquote: ["class"],
  code: ["class"],
  pre: ["class"],
  hr: ["class"],
  div: ["class"],
  a: ["href", "title", "target", "rel", "class"],
};

export function sanitizeHtml(html: string | null | undefined): string {
  if (!html || typeof html !== "string") return "";

  return xss(html, {
    whiteList,
    stripIgnoreTag: true,
    stripIgnoreTagBody: ["script", "style", "iframe", "object", "embed", "base", "meta"],
    onTagAttr: (tag, name, value) => {
      // Prevent javascript:, vbscript:, and data: URI XSS in <a> tags
      if (tag === "a" && name === "href") {
        const clean = value.trim().toLowerCase();
        if (
          clean.startsWith("javascript:") ||
          clean.startsWith("vbscript:") ||
          clean.startsWith("data:")
        ) {
          return "";
        }
      }
      return undefined;
    },
  });
}
