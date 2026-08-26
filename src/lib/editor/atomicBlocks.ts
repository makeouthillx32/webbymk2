// lib/editor/atomicBlocks.ts
// ─────────────────────────────────────────────────────────────────────────────
// "Atomic blocks" are markdown spans a native <textarea> stores as plain text
// but that the editor UI should treat as one indivisible unit — post image
// refs and [[wiki]] links today, any future post://-style or [[…]]-style
// syntax for free. One parser here, one set of range helpers; keyboard
// handlers (useAtomicBlockEditing) consume it instead of running their own
// regexes.
//
// Every helper is pure string-in/range-out — no DOM — so it's testable and
// reusable outside the blog editor if another screen grows the same needs.
// ─────────────────────────────────────────────────────────────────────────────

export type AtomicBlockType = "post-image" | "wikilink";

export interface AtomicBlock {
  start: number;
  end: number;
  value: string;
  type: AtomicBlockType;
}

/** `![alt](post://slot)` — the pasted-image reference. */
export const POST_IMAGE_PATTERN = /!\[[^\]]*\]\(post:\/\/[^)\s]+\)/g;

/** `[[slug]]` / `[[slug|label]]` — cross-post links (see lib/blog/parseDra.ts). */
export const WIKILINK_PATTERN = /\[\[[^\]\n]+\]\]/g;

/** Every atomic block in `value`, left to right. */
export function findAtomicBlocks(value: string): AtomicBlock[] {
  const blocks: AtomicBlock[] = [];

  for (const match of value.matchAll(POST_IMAGE_PATTERN)) {
    if (match.index === undefined) continue;
    blocks.push({ start: match.index, end: match.index + match[0].length, value: match[0], type: "post-image" });
  }

  for (const match of value.matchAll(WIKILINK_PATTERN)) {
    if (match.index === undefined) continue;
    blocks.push({ start: match.index, end: match.index + match[0].length, value: match[0], type: "wikilink" });
  }

  return blocks.sort((a, b) => a.start - b.start);
}

/** The block a collapsed caret sits strictly inside of, if any. */
export function blockContaining(position: number, blocks: AtomicBlock[]): AtomicBlock | undefined {
  return blocks.find((block) => position > block.start && position < block.end);
}

/**
 * A block that is the only non-whitespace content on its line should take
 * its line with it when deleted — otherwise every image paste leaves a
 * permanent blank line once the reference is removed.
 */
export function expandAtomicBlockDeletion(
  value: string,
  block: Pick<AtomicBlock, "start" | "end">,
): { start: number; end: number } {
  const lineStart = value.lastIndexOf("\n", block.start - 1) + 1;
  const nextNewline = value.indexOf("\n", block.end);
  const lineEnd = nextNewline === -1 ? value.length : nextNewline;

  const beforeBlock = value.slice(lineStart, block.start);
  const afterBlock = value.slice(block.end, lineEnd);
  const blockIsOnlyContent = beforeBlock.trim() === "" && afterBlock.trim() === "";

  if (!blockIsOnlyContent) {
    return { start: block.start, end: block.end };
  }

  // Prefer eating the trailing newline so surrounding paragraphs collapse
  // back to a single blank line instead of two.
  if (lineEnd < value.length) {
    return { start: lineStart, end: lineEnd + 1 };
  }
  if (lineStart > 0) {
    return { start: lineStart - 1, end: lineEnd };
  }
  return { start: lineStart, end: lineEnd };
}

/**
 * Grow [start, end) so it fully covers every atomic block it merely
 * touches — used before Backspace/Delete/Cut/typed-replacement whenever the
 * caller already knows the selection isn't collapsed.
 */
export function expandSelectionAcrossAtomicBlocks(
  selectionStart: number,
  selectionEnd: number,
  blocks: AtomicBlock[],
): { start: number; end: number } {
  let start = selectionStart;
  let end = selectionEnd;

  for (const block of blocks) {
    const intersects = start < block.end && end > block.start;
    if (!intersects) continue;
    start = Math.min(start, block.start);
    end = Math.max(end, block.end);
  }

  return { start, end };
}

/**
 * A caret that lands inside a block (click, arrow-key nav) snaps to whichever
 * edge matches the direction of travel, so the block can never be edited a
 * character at a time.
 */
export function normalizeCaretAroundAtomicBlock(
  position: number,
  blocks: AtomicBlock[],
  direction: "forward" | "backward",
): number {
  const containing = blockContaining(position, blocks);
  if (!containing) return position;
  return direction === "backward" ? containing.start : containing.end;
}
