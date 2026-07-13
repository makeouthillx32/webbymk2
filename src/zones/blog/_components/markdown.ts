// src/zones/blog/_components/markdown.ts
// Server-side markdown → HTML for blog posts: heading anchors + TOC extraction
// and syntax-highlighted code blocks (GitButler-style rendering).

import { Marked } from "marked";
import hljs from "highlight.js";

export interface TocEntry {
  id:    string;
  text:  string;
  depth: number; // 2 | 3
}

function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Render markdown to HTML and collect a table of contents (h2/h3). */
export function renderMarkdown(src: string): { html: string; toc: TocEntry[] } {
  const toc: TocEntry[] = [];
  const seen = new Map<string, number>();

  const marked = new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        let id = headingId(text);
        const n = seen.get(id) ?? 0;
        seen.set(id, n + 1);
        if (n > 0) id = `${id}-${n}`;
        if (depth === 2 || depth === 3) toc.push({ id, text: text.replace(/<[^>]*>/g, ""), depth });
        return `<h${depth} id="${id}">${text}</h${depth}>\n`;
      },
      code({ text, lang }) {
        const language = (lang ?? "").trim().split(/\s+/)[0];
        let body: string;
        try {
          body = language && hljs.getLanguage(language)
            ? hljs.highlight(text, { language }).value
            : escapeHtml(text);
        } catch {
          body = escapeHtml(text);
        }
        const label = language
          ? `<div class="code-lang">${escapeHtml(language)}</div>`
          : "";
        return `${label}<pre><code class="hljs${language ? ` language-${escapeHtml(language)}` : ""}">${body}</code></pre>\n`;
      },
    },
  });

  const html = marked.parse(src, { async: false }) as string;
  return { html, toc };
}
