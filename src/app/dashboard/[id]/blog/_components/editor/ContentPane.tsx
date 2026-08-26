"use client";
// Title, excerpt and the markdown surface. The textarea accepts dropped and
// pasted images directly: the post:// reference lands at the caret immediately
// while the file uploads in the background.

import {
  type ChangeEvent,
  type ClipboardEvent,
  type ComponentType,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bold,
  Code2,
  FileUp,
  Heading2,
  ImageIcon,
  Italic,
  Link2,
  List,
  Loader2,
  Quote,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { CodeEditor, Field, fieldControlClass } from "@/components/dashboard";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import { useAtomicBlockEditing } from "@/hooks/useAtomicBlockEditing";
import { highlightMarkdown } from "@/lib/editor/markdownHighlight";
import { renderPostPreview, wordCount, readingTimeMinutes } from "@/lib/blog/markdown";
import type { SlotMap } from "@/lib/blog/images";
import type { TextInsertionApi } from "@/hooks/useTextInsertion";
import type { BlogPostDraft, Locale } from "@/types/blog";

const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024;

interface ToolbarAction {
  icon: ComponentType<{ size?: number }>;
  label: string;
  run: (api: TextInsertionApi) => void;
}

const TOOLBAR: ToolbarAction[] = [
  { icon: Bold, label: "Bold", run: (api) => api.wrap("**") },
  { icon: Italic, label: "Italic", run: (api) => api.wrap("_") },
  { icon: Heading2, label: "Heading", run: (api) => api.insert("\n## ") },
  { icon: Link2, label: "Link", run: (api) => api.wrap("[", "](https://)") },
  { icon: List, label: "List", run: (api) => api.insert("\n- ") },
  { icon: Quote, label: "Quote", run: (api) => api.insert("\n> ") },
  { icon: Code2, label: "Code block", run: (api) => api.insert("\n```ts\n\n```\n") },
];

export function ContentPane({
  draft,
  locale,
  slots,
  insertion,
  onLocalizedChange,
  onPasteFiles,
  onDropFiles,
  onImportDra,
  uploadingImages,
  canUploadImages,
}: {
  draft: BlogPostDraft;
  locale: Locale;
  slots: SlotMap;
  insertion: TextInsertionApi;
  onLocalizedChange: (field: "title" | "excerpt" | "content", value: string) => void;
  onPasteFiles: (event: ClipboardEvent<HTMLTextAreaElement>) => boolean;
  onDropFiles: (files: File[]) => void;
  onImportDra: (file: File) => void;
  uploadingImages: number;
  canUploadImages: boolean;
}) {
  const [preview, setPreview] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const content = draft.content[locale] ?? "";
  const previewHtml = useMemo(
    () => renderPostPreview(content, draft.content_format, slots),
    [content, draft.content_format, slots],
  );
  // post:// image refs and [[wiki]] links delete and select as one unit
  // instead of one character at a time — see hooks/useAtomicBlockEditing.
  const atomicEditing = useAtomicBlockEditing(content, (next) => onLocalizedChange("content", next));

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension === "dra") return onImportDra(file);
    if (extension !== "md" && extension !== "markdown") {
      return toast.error("Choose a .md, .markdown, or .dra file");
    }
    if (file.size > MAX_MARKDOWN_BYTES) {
      return toast.error("Markdown files must be 2 MB or smaller");
    }
    if (
      content.trim() &&
      !window.confirm(`Replace the current ${locale.toUpperCase()} content with ${file.name}?`)
    ) {
      return;
    }

    const source = (await file.text()).replace(/^﻿/, "");
    if (!source.trim()) return toast.error("That Markdown file is empty");
    onLocalizedChange("content", source);
    setPreview(false);
    toast.success(`${file.name} imported into ${locale.toUpperCase()}`);
    requestAnimationFrame(() => insertion.focus());
  };

  return (
    <div className="space-y-4">
      <Field label={`Title (${locale})`} htmlFor="post-title">
        <Input
          id="post-title"
          value={draft.title[locale] ?? ""}
          onChange={(event) => onLocalizedChange("title", event.target.value)}
          placeholder="Give the post a headline"
        />
      </Field>

      <Field label={`Excerpt / subtitle (${locale})`} htmlFor="post-excerpt">
        <textarea
          id="post-excerpt"
          className={cn(fieldControlClass, "min-h-[64px] resize-y")}
          value={draft.excerpt[locale] ?? ""}
          onChange={(event) => onLocalizedChange("excerpt", event.target.value)}
          placeholder="One or two lines shown on cards and in search results"
        />
      </Field>

      <Field
        label={`Content (${locale}) — ${draft.content_format === "md" ? "Markdown" : "HTML"}`}
        action={
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,.dra,text/markdown,text/plain"
              className="hidden"
              onChange={importFile}
            />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (files.length > 0) onDropFiles(files);
              }}
            />
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              title="Upload images and insert them here"
              className="inline-flex items-center gap-1.5 rounded px-1.5 py-1.5 text-xs font-medium text-primary hover:underline"
            >
              <ImageIcon size={14} aria-hidden="true" />
              Add image
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title={`Import .md into ${locale.toUpperCase()}, or a .dra draft (fills the whole form)`}
              className="inline-flex items-center gap-1.5 rounded px-1.5 py-1.5 text-xs font-medium text-primary hover:underline"
            >
              <FileUp size={14} aria-hidden="true" />
              Import
            </button>
            <button
              type="button"
              onClick={() => setPreview((current) => !current)}
              className="rounded px-1.5 py-1.5 text-xs font-medium text-primary hover:underline"
            >
              {preview ? "Edit" : "Preview"}
            </button>
          </>
        }
        hint={
          canUploadImages
            ? "Drop or paste an image straight into the text — it uploads into the next slot and the reference appears at your cursor."
            : "Add a title first, then images dropped here file themselves under the post's slug."
        }
      >
        {preview ? (
          <div
            className="blog-content min-h-[360px] rounded-[var(--radius)] border border-[hsl(var(--border))] p-4 text-[hsl(var(--foreground))]"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        ) : (
          <div className="relative">
            {/* Toolbar: horizontal scroll on phones instead of wrapping into a
                block that pushes the editor down — thumb-reach stays constant. */}
            <div className="mb-0 flex items-center gap-0.5 overflow-x-auto rounded-t-[var(--radius)] border border-b-0 border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {TOOLBAR.map(({ icon: Icon, label, run }) => (
                <button
                  key={label}
                  type="button"
                  title={label}
                  aria-label={label}
                  // mousedown (not click) is where a tap would normally blur the
                  // textarea — on iOS that drops the keyboard and it has to pop
                  // back up when insertion.focus() runs, a visible flicker on
                  // every single toolbar tap. preventDefault here keeps focus
                  // (and the selection wrap()/insert() need) on the textarea
                  // the whole time.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => run(insertion)}
                  className="flex shrink-0 min-h-[40px] min-w-[40px] items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] md:min-h-0 md:min-w-0 md:p-1.5"
                >
                  <Icon size={15} />
                </button>
              ))}
              <span className="ml-auto shrink-0 whitespace-nowrap pl-3 pr-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                {uploadingImages > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-primary">
                    <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                    uploading {uploadingImages}
                  </span>
                ) : (
                  `${wordCount(content)} words · ${readingTimeMinutes(content)} min`
                )}
              </span>
            </div>

            <CodeEditor
              value={content}
              onValueChange={(next) => onLocalizedChange("content", next)}
              highlight={highlightMarkdown}
              textareaRef={insertion.textareaRef}
              wrapperClassName={cn(
                "rounded-b-[var(--radius)] border border-[hsl(var(--border))]",
                "focus-within:ring-1 focus-within:ring-primary",
                dragOver && "ring-2 ring-primary",
              )}
              className="min-h-[360px]"
              onPaste={onPasteFiles}
              onKeyDown={atomicEditing.onKeyDown}
              onCut={atomicEditing.onCut}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes("Files")) return;
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                const files = Array.from(event.dataTransfer.files ?? []);
                if (files.length === 0) return;
                event.preventDefault();
                event.stopPropagation();
                setDragOver(false);
                onDropFiles(files);
              }}
              placeholder={"## Heading\n\nWrite markdown here…\n\nDrop or paste an image to place it."}
            />

            {dragOver ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-[hsl(var(--primary-foreground))]">
                  Drop to insert at the cursor
                </span>
              </div>
            ) : null}
          </div>
        )}
      </Field>
    </div>
  );
}
