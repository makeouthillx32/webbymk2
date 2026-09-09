// src/zones/blog/_components/blocks.ts
// ─────────────────────────────────────────────────────────────────────────────
// Blog block system — marked extensions for the content blocks the post editor
// palette offers beyond GFM.
//
// Written for THIS renderer, not ported from anywhere. The block *taxonomy*
// (names, grouping, prop shapes) follows the OpenKnowledge palette so authoring
// concepts line up; the implementations are original because OK renders blocks
// as MDX JSX nodes inside a TipTap/ProseMirror editor, while this blog is
// markdown string → HTML string → `dangerouslySetInnerHTML` + a small client
// hydrator. Nothing here derives from GPL source.
//
// ── Three syntaxes, chosen per block shape ──────────────────────────────────
//
//   Container (prose inside)   :::note[Title] … :::      Callout, Accordion,
//                                                        Toggle, Tabs, Align
//   Data (JSON spec inside)    ```mermaid … ```          Mermaid, Stats, Video,
//                                                        Audio, PDF, File,
//                                                        Embed, Excalidraw
//   Inline                     [^1]  :smile:  #tag       Footnote, Emoji, Tag
//
// The data blocks deliberately mirror the existing ```chart``` contract in
// markdown.ts: emit an inert placeholder carrying a `data-*` JSON attribute
// plus a no-JS fallback, and let a client hydrator mount the live thing. Bad
// JSON must NEVER blank a post — every data block falls through to a normal
// highlighted code block, same as chart does.
// ─────────────────────────────────────────────────────────────────────────────

import type { MarkedExtension, Tokens } from "marked";

// ── shared helpers ──────────────────────────────────────────────────────────

/** Escape for HTML *text* content. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escape for an HTML *attribute* — must include quotes, or a JSON payload's
 *  own double-quotes truncate the attribute and silently break hydration.
 *  (Same bug class the chart block documents in markdown.ts.) */
export function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Container directives  :::name[arg] … ::: ────────────────────────────────
//
// One generic tokenizer serves every container block. `arg` is the bracketed
// value (`:::note[Heads up]`), body is parsed as full block markdown so
// containers nest and can hold lists, code, images — anything.

const CALLOUT_TYPES = new Set(["note", "tip", "info", "warning", "danger", "success"]);
const CONTAINER_NAMES = new Set([
  ...CALLOUT_TYPES,
  "callout",
  "accordion",
  "toggle",
  "tabs",
  "align",
]);

interface ContainerToken extends Tokens.Generic {
  type: "container";
  name: string;
  arg: string;
  tokens: Tokens.Generic[];
  raw: string;
}

// Opening fence: ::: + name + optional [arg]. Body runs to a closing ::: at
// the start of a line. `[\s\S]*?` is lazy so the FIRST closing fence wins.
const CONTAINER_RE = /^:::([a-z]+)(?:\[([^\]]*)\])?[ \t]*\n([\s\S]*?)\n:::[ \t]*(?:\n|$)/;

/** Split a tabs body on `==Label` lines into labelled panes. */
function splitTabs(body: string): { label: string; content: string }[] {
  const lines = body.split("\n");
  const panes: { label: string; content: string[] }[] = [];
  for (const line of lines) {
    const m = /^==\s*(.+?)\s*$/.exec(line);
    if (m) panes.push({ label: m[1], content: [] });
    else if (panes.length) panes[panes.length - 1].content.push(line);
    // lines before the first ==Label are dropped — a tabs block with no panes
    // renders as nothing rather than leaking stray prose.
  }
  return panes.map((p) => ({ label: p.label, content: p.content.join("\n").trim() }));
}

export function containerExtension(): MarkedExtension {
  return {
    extensions: [
      {
        name: "container",
        level: "block",
        start(src: string) {
          return src.match(/^:::[a-z]/m)?.index;
        },
        tokenizer(src: string) {
          const m = CONTAINER_RE.exec(src);
          if (!m) return undefined;
          const [raw, name, arg = "", body] = m;
          if (!CONTAINER_NAMES.has(name)) return undefined;

          // Tabs parses its own panes; everything else is plain block markdown.
          const token: ContainerToken = {
            type: "container",
            name,
            arg,
            raw,
            tokens: [],
          };
          if (name === "tabs") {
            (token as ContainerToken & { panes?: unknown }).panes = splitTabs(body).map((p) => ({
              label: p.label,
              tokens: this.lexer.blockTokens(p.content, []),
            }));
          } else {
            token.tokens = this.lexer.blockTokens(body, []);
          }
          return token;
        },
        renderer(tokenIn: Tokens.Generic) {
          const token = tokenIn as ContainerToken;
          const { name, arg } = token;
          const inner = () => this.parser.parse(token.tokens);

          // ── Tabs ──────────────────────────────────────────────────────────
          if (name === "tabs") {
            const panes =
              (token as ContainerToken & {
                panes?: { label: string; tokens: Tokens.Generic[] }[];
              }).panes ?? [];
            if (!panes.length) return "";
            // Radio inputs give working tab switching with ZERO JavaScript —
            // the panes stay readable if scripts never run, and there is no
            // hydration cost. `name` is per-block so multiple tab groups in one
            // post don't fight over the same radio group.
            const group = `tabs-${slugify(panes.map((p) => p.label).join("-"))}`;
            const head = panes
              .map(
                (p, i) =>
                  `<input class="blog-tab-radio" type="radio" name="${escapeAttr(group)}" id="${escapeAttr(
                    `${group}-${i}`
                  )}"${i === 0 ? " checked" : ""}><label class="blog-tab-label" for="${escapeAttr(
                    `${group}-${i}`
                  )}">${escapeHtml(p.label)}</label>`
              )
              .join("");
            const bodies = panes
              .map((p) => `<div class="blog-tab-pane">${this.parser.parse(p.tokens)}</div>`)
              .join("");
            return `<div class="blog-tabs" data-tabs="${panes.length}">${head}${bodies}</div>\n`;
          }

          // ── Accordion / Toggle — native <details>, no JS ──────────────────
          if (name === "accordion" || name === "toggle") {
            const summary = arg || (name === "accordion" ? "Details" : "More");
            const open = name === "accordion" ? "" : "";
            return `<details class="blog-${name}"${open}><summary>${escapeHtml(
              summary
            )}</summary><div class="blog-${name}-body">${inner()}</div></details>\n`;
          }

          // ── Align ─────────────────────────────────────────────────────────
          if (name === "align") {
            const dir = ["left", "center", "right", "justify"].includes(arg) ? arg : "center";
            return `<div class="blog-align" style="text-align:${dir}">${inner()}</div>\n`;
          }

          // ── Callout (":::note" … or explicit ":::callout[type]") ──────────
          const type = name === "callout" ? (CALLOUT_TYPES.has(arg) ? arg : "note") : name;
          const title = name === "callout" ? "" : arg;
          const heading = title
            ? `<p class="blog-callout-title">${escapeHtml(title)}</p>`
            : "";
          return `<aside class="blog-callout blog-callout-${escapeAttr(
            type
          )}" data-callout="${escapeAttr(type)}" role="note">${heading}<div class="blog-callout-body">${inner()}</div></aside>\n`;
        },
      },
    ],
  };
}

// ── Footnotes  text[^1]  +  [^1]: definition ────────────────────────────────
//
// marked has no footnote support, so this is a two-part extension: an inline
// tokenizer for the reference and a block tokenizer for the definition. Both
// render immediately (the reference as a superscript link, the definition as a
// list item), which keeps definitions wherever the author put them rather than
// collecting them into a footer — simpler, and it survives partial rendering.

export function footnoteExtension(): MarkedExtension {
  return {
    extensions: [
      {
        name: "footnoteRef",
        level: "inline",
        start(src: string) {
          return src.match(/\[\^/)?.index;
        },
        tokenizer(src: string) {
          const m = /^\[\^([^\]\s]+)\]/.exec(src);
          if (!m) return undefined;
          return { type: "footnoteRef", raw: m[0], id: m[1] } as Tokens.Generic;
        },
        renderer(token: Tokens.Generic) {
          const id = escapeAttr(String((token as { id: string }).id));
          return `<sup class="blog-fn-ref" id="fnref-${id}"><a href="#fn-${id}">${escapeHtml(
            String((token as { id: string }).id)
          )}</a></sup>`;
        },
      },
      {
        name: "footnoteDef",
        level: "block",
        start(src: string) {
          return src.match(/^\[\^/m)?.index;
        },
        tokenizer(src: string) {
          const m = /^\[\^([^\]\s]+)\]:[ \t]*(.+(?:\n(?![\[\n]).*)*)/.exec(src);
          if (!m) return undefined;
          return {
            type: "footnoteDef",
            raw: m[0],
            id: m[1],
            tokens: this.lexer.inlineTokens(m[2].trim()),
          } as Tokens.Generic;
        },
        renderer(token: Tokens.Generic) {
          const t = token as { id: string; tokens: Tokens.Generic[] };
          const id = escapeAttr(String(t.id));
          return `<div class="blog-footnote" id="fn-${id}"><sup>${escapeHtml(
            String(t.id)
          )}</sup> ${this.parser.parseInline(t.tokens)} <a class="blog-fn-back" href="#fnref-${id}" aria-label="Back to reference">↩</a></div>\n`;
        },
      },
    ],
  };
}

// ── Emoji  :smile: ──────────────────────────────────────────────────────────
//
// A small curated map rather than a full emoji dependency — the blog needs the
// handful writers actually reach for, and an unknown shortcode must pass
// through as literal text (so `:foo:` in prose or a code-ish line is safe).

const EMOJI: Record<string, string> = {
  smile: "😄", grin: "😁", joy: "😂", wink: "😉", thinking: "🤔",
  tada: "🎉", rocket: "🚀", fire: "🔥", sparkles: "✨", zap: "⚡",
  warning: "⚠️", bulb: "💡", bug: "🐛", wrench: "🔧", lock: "🔒",
  check: "✅", x: "❌", eyes: "👀", pray: "🙏", "+1": "👍", "-1": "👎",
  heart: "❤️", star: "⭐", books: "📚", memo: "📝", package: "📦",
  hourglass: "⏳", chart: "📊", test_tube: "🧪", microscope: "🔬",
};

export function emojiExtension(): MarkedExtension {
  return {
    extensions: [
      {
        name: "emoji",
        level: "inline",
        start(src: string) {
          return src.match(/:[a-z0-9+_-]/i)?.index;
        },
        tokenizer(src: string) {
          const m = /^:([a-z0-9+_-]+):/i.exec(src);
          if (!m) return undefined;
          const glyph = EMOJI[m[1].toLowerCase()];
          if (!glyph) return undefined; // unknown → leave as literal text
          return { type: "emoji", raw: m[0], glyph } as Tokens.Generic;
        },
        renderer(token: Tokens.Generic) {
          return `<span class="blog-emoji" role="img">${(token as { glyph: string }).glyph}</span>`;
        },
      },
    ],
  };
}

// ── Tag  #research ──────────────────────────────────────────────────────────
//
// Links into the blog's EXISTING /tag/[tag] route, so tags are navigational
// rather than decorative. Only fires at a word boundary and rejects a leading
// digit, so `#1`, `#fff` in CSS, and heading syntax are never captured.

export function tagExtension(): MarkedExtension {
  return {
    extensions: [
      {
        name: "tag",
        level: "inline",
        start(src: string) {
          return src.match(/(^|\s)#[a-z]/i)?.index;
        },
        tokenizer(src: string) {
          const m = /^#([a-z][a-z0-9_-]{1,40})\b/i.exec(src);
          if (!m) return undefined;
          return { type: "tag", raw: m[0], tag: m[1] } as Tokens.Generic;
        },
        renderer(token: Tokens.Generic) {
          const tag = String((token as { tag: string }).tag);
          return `<a class="blog-tag" href="/tag/${encodeURIComponent(
            tag.toLowerCase()
          )}">#${escapeHtml(tag)}</a>`;
        },
      },
    ],
  };
}

// ── Data blocks — fenced, JSON body, hydrated client-side ───────────────────
//
// Returns HTML for a recognised fenced language, or null to let the caller
// fall through to normal highlighted-code rendering. Called from markdown.ts's
// `code()` renderer so it composes with the existing chart handling instead of
// competing with it.

type Json = Record<string, unknown>;

function figure(cls: string, attr: string, spec: Json, fallback: string, caption?: string): string {
  const cap =
    typeof caption === "string" && caption.trim()
      ? `<figcaption class="blog-figcaption">${escapeHtml(caption)}</figcaption>`
      : "";
  return `<figure class="${cls}" ${attr}="${escapeAttr(
    JSON.stringify(spec)
  )}">${cap}<div class="${cls}-slot"><span class="blog-block-fallback">${escapeHtml(
    fallback
  )}</span></div></figure>\n`;
}

/** Media that needs no JS at all — emit the real element server-side. */
function mediaTag(kind: "video" | "audio", spec: Json): string {
  const src = typeof spec.src === "string" ? spec.src : "";
  if (!src) return "";
  const attrs = [
    spec.controls === false ? "" : "controls",
    spec.autoplay ? "autoplay" : "",
    spec.muted || spec.autoplay ? "muted" : "", // autoplay only works muted
    spec.loop ? "loop" : "",
    kind === "video" && spec.playsinline !== false ? "playsinline" : "",
    kind === "video" && typeof spec.poster === "string" ? `poster="${escapeAttr(spec.poster)}"` : "",
    typeof spec.preload === "string" ? `preload="${escapeAttr(spec.preload)}"` : `preload="metadata"`,
  ]
    .filter(Boolean)
    .join(" ");
  const cap =
    typeof spec.title === "string" && spec.title.trim()
      ? `<figcaption class="blog-figcaption">${escapeHtml(spec.title)}</figcaption>`
      : "";
  return `<figure class="blog-${kind}"><${kind} ${attrs} src="${escapeAttr(
    src
  )}"></${kind}>${cap}</figure>\n`;
}

export function renderDataBlock(language: string, text: string): string | null {
  // Every data block is JSON-bodied except mermaid, whose body is its own DSL.
  if (language === "mermaid") {
    // Hydrated client-side; the <pre> body doubles as the no-JS fallback and
    // keeps the diagram source readable/selectable if the lib fails to load.
    return `<figure class="blog-mermaid"><pre class="blog-mermaid-src">${escapeHtml(
      text
    )}</pre></figure>\n`;
  }

  let spec: Json;
  try {
    spec = JSON.parse(text) as Json;
  } catch {
    return null; // fall through to a highlighted code block — never blank a post
  }

  switch (language) {
    case "video":
    case "audio":
      return mediaTag(language, spec);

    case "pdf": {
      const src = typeof spec.src === "string" ? spec.src : "";
      if (!src) return null;
      const title = typeof spec.title === "string" ? spec.title : "PDF document";
      // <object> degrades to its children when the browser can't render a PDF,
      // so mobile Safari gets a download link instead of an empty grey box.
      return `<figure class="blog-pdf"><object data="${escapeAttr(
        src
      )}" type="application/pdf" title="${escapeAttr(title)}"><a href="${escapeAttr(
        src
      )}" download>${escapeHtml(title)} (download)</a></object></figure>\n`;
    }

    case "file": {
      const src = typeof spec.src === "string" ? spec.src : "";
      if (!src) return null;
      const name = typeof spec.name === "string" ? spec.name : src.split("/").pop() || "file";
      const size = typeof spec.size === "string" ? ` <span class="blog-file-size">${escapeHtml(spec.size)}</span>` : "";
      return `<a class="blog-file" href="${escapeAttr(src)}" download><span class="blog-file-name">${escapeHtml(
        name
      )}</span>${size}</a>\n`;
    }

    case "stats": {
      // Pure server render — stat cards are static numbers, no JS needed.
      const cards = Array.isArray(spec.cards) ? spec.cards : [];
      if (!cards.length) return null;
      const items = cards
        .map((c) => {
          const card = c as Json;
          const label = typeof card.label === "string" ? card.label : "";
          const value = card.value == null ? "" : String(card.value);
          const delta = typeof card.delta === "string" ? card.delta : "";
          const trend =
            typeof card.trend === "string" && ["up", "down", "flat"].includes(card.trend)
              ? card.trend
              : "";
          return `<div class="blog-stat-card"${trend ? ` data-trend="${escapeAttr(trend)}"` : ""}><div class="blog-stat-value">${escapeHtml(
            value
          )}</div><div class="blog-stat-label">${escapeHtml(label)}</div>${
            delta ? `<div class="blog-stat-delta">${escapeHtml(delta)}</div>` : ""
          }</div>`;
        })
        .join("");
      return `<div class="blog-stats" data-cards="${cards.length}">${items}</div>\n`;
    }

    case "embed":
      // Hydrated client-side against a provider ALLOWLIST — the hydrator, not
      // this renderer, decides what may be framed. Never server-fetch the URL
      // (SSRF); we only pass the spec through.
      return figure(
        "blog-embed",
        "data-embed-config",
        spec,
        "Embedded content — enable JavaScript to view.",
        typeof spec.title === "string" ? spec.title : undefined
      );

    case "excalidraw":
      return figure(
        "blog-excalidraw",
        "data-excalidraw-config",
        spec,
        "Diagram — enable JavaScript to view.",
        typeof spec.title === "string" ? spec.title : undefined
      );

    default:
      return null;
  }
}

/** Every marked extension this blog adds, in one call. */
export function blogBlockExtensions(): MarkedExtension[] {
  return [containerExtension(), footnoteExtension(), emojiExtension(), tagExtension()];
}
