// lib/editor/markdownHighlight.ts
// ─────────────────────────────────────────────────────────────────────────────
// Markdown → highlighted HTML for the IDE-style editor overlay.
//
// The output is rendered in a <pre> that sits EXACTLY behind a transparent
// <textarea>, so one rule is absolute: the emitted text content must be
// character-for-character identical to the input. Only <span style> wrappers
// may be added — never extra characters, never removed ones — or the overlay
// drifts out of alignment with the caret.
//
// Pure string → string. No DOM, no React — testable and reusable anywhere.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Token colors. Semantic theme vars where they exist; fixed mid-scale accents
 * (readable on both light and dark) for the roles the theme has no token for.
 */
const C = {
  punct: "hsl(var(--muted-foreground))",
  heading: "hsl(var(--primary))",
  code: "#d97706", // amber – inline code
  codeBg: "rgba(217,119,6,0.10)",
  slot: "#10a37f", // emerald – post:// refs, the "variables"
  slotBg: "rgba(16,163,127,0.14)",
  url: "#0ea5e9", // sky – link targets
  alt: "#ec4899", // pink – image alt text
  wiki: "#8b5cf6", // violet – [[wiki]] links
  fenceBody: "hsl(var(--muted-foreground))",
  num: "#d97706",
} as const;

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function span(text: string, style: string): string {
  return `<span style="${style}">${text}</span>`;
}

/**
 * Placeholder machinery so later regexes never re-match earlier spans.
 * Placeholders are NUL/SOH-framed indices — control characters that cannot
 * occur in textarea input, so they can never collide with document text.
 */
type Bag = string[];

// Indices are encoded in LETTERS (0→a … 9→j), not digits — chartLine
// highlights numbers, and digit placeholders were themselves getting matched
// and re-stashed, which corrupted the overlay. Letters survive every pass:
// no later regex targets bare letters between the NUL/SOH frame.
const DIGIT_LETTERS = "abcdefghij";
function stash(bag: Bag, html: string): string {
  bag.push(html);
  const key = String(bag.length - 1).replace(/\d/g, (d) => DIGIT_LETTERS[Number(d)]);
  return `\u0000${key}\u0001`;
}
function unstash(bag: Bag, text: string): string {
  return text.replace(/\u0000([a-j]+)\u0001/g, (_, key: string) => {
    const index = Number([...key].map((c) => DIGIT_LETTERS.indexOf(c)).join(""));
    return bag[index];
  });
}

const SLOT_CHIP = `color:${C.slot};background:${C.slotBg};border-radius:3px`;

/** Inline tokens within one already-escaped line. */
function inline(escaped: string): string {
  const bag: Bag = [];
  let text = escaped;

  // Inline code first — nothing inside backticks should be re-tokenized.
  text = text.replace(/`([^`]+)`/g, (_, body: string) =>
    stash(bag, span("`", `color:${C.punct}`) + span(body, `color:${C.code};background:${C.codeBg};border-radius:3px`) + span("`", `color:${C.punct}`)),
  );

  // Images: ![alt](target) — the editor's main "variable" sites.
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt: string, target: string) => {
    const targetHtml = target.startsWith("post://")
      ? span(target, SLOT_CHIP)
      : span(target, `color:${C.url}`);
    return stash(
      bag,
      span("![", `color:${C.punct}`) + span(alt, `color:${C.alt}`) + span("](", `color:${C.punct}`) + targetHtml + span(")", `color:${C.punct}`),
    );
  });

  // Bare post://slot references outside image syntax.
  text = text.replace(/post:\/\/[\w][\w.-]*/g, (ref) => stash(bag, span(ref, SLOT_CHIP)));

  // Links: [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, url: string) =>
    stash(
      bag,
      span("[", `color:${C.punct}`) + span(label, `color:${C.url}`) + span("](", `color:${C.punct}`) + span(url, `color:${C.punct};text-decoration:underline`) + span(")", `color:${C.punct}`),
    ),
  );

  // Wiki links: [[slug]] / [[slug|label]]
  text = text.replace(/\[\[[^\]]+\]\]/g, (whole) => stash(bag, span(whole, `color:${C.wiki}`)));

  // Bold — markers muted, content emphasized.
  text = text.replace(/\*\*([^*]+)\*\*/g, (_, body: string) =>
    stash(bag, span("**", `color:${C.punct}`) + span(body, "font-weight:700") + span("**", `color:${C.punct}`)),
  );

  // Italic via underscores (single-star italic is skipped on purpose — it
  // collides with list markers and bold edge cases for marginal value).
  text = text.replace(/(^|\s)_([^_]+)_(?=\s|$)/g, (_, lead: string, body: string) =>
    lead + stash(bag, span("_", `color:${C.punct}`) + span(body, "font-style:italic") + span("_", `color:${C.punct}`)),
  );

  return unstash(bag, text);
}

/** One line inside a ```chart fence — light JSON tokenization. */
function chartLine(escaped: string): string {
  const bag: Bag = [];
  let text = escaped;
  // Keys: "name": — sky. Values: "text" — emerald.
  text = text.replace(/&quot;|"([^"]*)"(\s*:)/g, (whole, key: string | undefined, colon: string | undefined) =>
    key !== undefined ? stash(bag, span(`"${key}"`, `color:${C.url}`) + colon) : whole,
  );
  text = text.replace(/"([^"]*)"/g, (_, value: string) => stash(bag, span(`"${value}"`, `color:${C.slot}`)));
  // No lookbehind (tsconfig targets ES2017) — capture the boundary and re-emit it.
  text = text.replace(/(^|[^\w ])(-?\d+(?:\.\d+)?)/g, (_, lead: string, n: string) =>
    lead + stash(bag, span(n, `color:${C.num}`)),
  );
  text = text.replace(/[{}[\],:]/g, (p) => stash(bag, span(p, `color:${C.punct}`)));
  return unstash(bag, text);
}

/**
 * Highlight a whole markdown document. Returns HTML whose text content equals
 * the input exactly (see header comment).
 */
export function highlightMarkdown(source: string): string {
  const lines = (source ?? "").split("\n");
  const out: string[] = [];
  let fence: string | null = null; // language of the open fence, "" = plain

  for (const raw of lines) {
    const escaped = esc(raw);

    // Fence open/close
    const fenceMatch = raw.match(/^```([\w-]*)\s*$/);
    if (fenceMatch) {
      if (fence === null) {
        fence = fenceMatch[1] ?? "";
        const lang = fenceMatch[1]
          ? span(fenceMatch[1], fenceMatch[1] === "chart" ? SLOT_CHIP : `color:${C.code}`)
          : "";
        out.push(span("```", `color:${C.punct}`) + lang + escaped.slice(3 + (fenceMatch[1]?.length ?? 0)));
      } else {
        fence = null;
        out.push(span(escaped, `color:${C.punct}`));
      }
      continue;
    }

    if (fence !== null) {
      out.push(fence === "chart" ? chartLine(escaped) : span(escaped, `color:${C.fenceBody}`));
      continue;
    }

    // Headings
    const heading = escaped.match(/^(#{1,6})(\s+)(.*)$/);
    if (heading) {
      out.push(
        span(heading[1], `color:${C.heading};font-weight:700`) + heading[2] + span(inline(heading[3]), "font-weight:700"),
      );
      continue;
    }

    // Horizontal rule
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(raw)) {
      out.push(span(escaped, `color:${C.punct}`));
      continue;
    }

    // Blockquote (">" is escaped to &gt;)
    const quote = escaped.match(/^(\s*)(&gt;)(\s?)(.*)$/);
    if (quote) {
      out.push(quote[1] + span(quote[2], `color:${C.heading}`) + quote[3] + span(inline(quote[4]), "font-style:italic"));
      continue;
    }

    // List markers
    const list = escaped.match(/^(\s*)([-*+]|\d+\.)(\s+)(.*)$/);
    if (list) {
      out.push(list[1] + span(list[2], `color:${C.heading};font-weight:700`) + list[3] + inline(list[4]));
      continue;
    }

    // Table rows — mute the pipes, tokenize the cells.
    if (/^\s*\|/.test(raw)) {
      out.push(
        escaped
          .split("|")
          .map((cell) => inline(cell))
          .join(span("|", `color:${C.punct}`)),
      );
      continue;
    }

    out.push(inline(escaped));
  }

  return out.join("\n");
}
