// src/zones/blog/_components/markdown.ts
// Server-side markdown → HTML for blog posts: heading anchors + TOC extraction
// and syntax-highlighted code blocks (GitButler-style rendering).

import { Marked } from "marked";
import hljs from "highlight.js";
import markedKatex from "marked-katex-extension";

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

        // ``` chart ``` → interactive chart placeholder (hydrated client-side by
        // ChartHydrator). Body is a JSON spec: { type, labels, datasets, … }.
        // Invalid JSON falls through to a normal (highlighted) code block so a
        // typo never blanks the post.
        if (language === "chart") {
          try {
            const spec = JSON.parse(text);
            const caption =
              typeof spec.title === "string" && spec.title.trim()
                ? `<figcaption class="blog-chart-caption">${escapeHtml(spec.title)}</figcaption>`
                : "";
            // Escape for an HTML ATTRIBUTE — must include quotes, or the JSON's
            // own double-quotes truncate the attribute and break hydration.
            const cfg = JSON.stringify(spec)
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#39;");
            // data-chart-config carries the spec; canvas is injected on hydrate.
            // The inner text is a graceful fallback if JS never runs.
            return `<figure class="blog-chart" data-chart-config="${cfg}">${caption}<div class="blog-chart-canvas"><span class="blog-chart-fallback">Interactive chart — enable JavaScript to view.</span></div></figure>\n`;
          } catch {
            /* fall through to normal code rendering below */
          }
        }

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

  // Render $...$ and $$...$$ as static KaTeX HTML + MathML. Keeping this in
  // the shared server-side renderer means article pages and RSS use the same
  // math semantics, with no client-side hydration requirement.
  marked.use(markedKatex({
    output: "htmlAndMathml",
    throwOnError: false,
  }));

  const html = marked.parse(src, { async: false }) as string;
  return { html, toc };
}
