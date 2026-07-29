"use client";
// Author picker plus a full byline editor. blog_authors carries avatar, a
// localized bio and four social links that the blog's byline block renders —
// the old dashboard could only set a name, so those columns stayed empty.

import { useState } from "react";
import { Loader2, Pencil, Plus, UserRound } from "lucide-react";
import { toast } from "react-hot-toast";
import { Field, fieldControlClass } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import { BLOG_IMAGE_BUCKET, uploadToFolder } from "@/lib/storage";
import { slugify } from "@/utils/slug";
import type { UseBlogAuthorsResult } from "@/hooks/blog/useBlogAuthors";
import type { BlogAuthor } from "@/types/blog";

const SOCIALS = [
  { key: "website_url", label: "Website", placeholder: "https://example.com" },
  { key: "github_url", label: "GitHub", placeholder: "https://github.com/…" },
  { key: "bluesky_url", label: "Bluesky", placeholder: "https://bsky.app/profile/…" },
  { key: "x_url", label: "X", placeholder: "https://x.com/…" },
] as const;

type AuthorForm = Partial<BlogAuthor> & { name: string };

const EMPTY_AUTHOR: AuthorForm = { name: "", bio: { en: "", de: "" } };

export function AuthorPanel({
  authors,
  value,
  onChange,
}: {
  authors: UseBlogAuthorsResult;
  value: string | null;
  onChange: (authorId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AuthorForm>(EMPTY_AUTHOR);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const selected = authors.authors.find((author) => author.id === value) ?? null;

  const openFor = (author: BlogAuthor | null) => {
    setForm(author ? { ...author, bio: author.bio ?? { en: "", de: "" } } : EMPTY_AUTHOR);
    setOpen(true);
  };

  const setFormField = (key: keyof BlogAuthor, next: unknown) =>
    setForm((current) => ({ ...current, [key]: next }));

  const uploadAvatar = async (file: File) => {
    const folder = `authors/${slugify(form.slug || form.name || "author") || "author"}`;
    setUploadingAvatar(true);
    try {
      const uploaded = await uploadToFolder({ bucket: BLOG_IMAGE_BUCKET, folder, file });
      setFormField("avatar_url", uploaded.publicUrl);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Avatar upload failed");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const submit = async () => {
    if (!form.name.trim()) return toast.error("An author name is required");
    setSaving(true);
    try {
      const saved = form.id
        ? await authors.updateAuthor(form.id, form)
        : await authors.createAuthor(form);
      if (saved) {
        onChange(saved.id);
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Field
        label="Author"
        htmlFor="post-author"
        action={
          <button
            type="button"
            onClick={() => openFor(null)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Plus size={13} aria-hidden="true" />
            New
          </button>
        }
      >
        <div className="flex items-center gap-2">
          {selected?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selected.avatar_url}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
              <UserRound size={16} aria-hidden="true" />
            </span>
          )}

          <select
            id="post-author"
            className={cn(fieldControlClass, "h-10")}
            value={value ?? ""}
            disabled={authors.loading}
            onChange={(event) => onChange(event.target.value || null)}
          >
            <option value="">— no byline —</option>
            {authors.authors.map((author) => (
              <option key={author.id} value={author.id}>
                {author.name}
              </option>
            ))}
          </select>

          {selected ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              title={`Edit ${selected.name}`}
              onClick={() => openFor(selected)}
            >
              <Pencil size={14} />
            </Button>
          ) : null}
        </div>
      </Field>

      <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? `Edit ${form.name}` : "New author"}</DialogTitle>
            <DialogDescription>
              Name, photo, bio and links appear in the byline block on every post by this author.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {form.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.avatar_url} alt="" className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
                  <UserRound size={20} aria-hidden="true" />
                </span>
              )}
              <label className="cursor-pointer text-xs font-medium text-primary hover:underline">
                {uploadingAvatar ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                    Uploading…
                  </span>
                ) : form.avatar_url ? (
                  "Replace photo"
                ) : (
                  "Upload photo"
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void uploadAvatar(file);
                  }}
                />
              </label>
              {form.avatar_url ? (
                <button
                  type="button"
                  onClick={() => setFormField("avatar_url", null)}
                  className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                >
                  Remove
                </button>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="author-name">
                <Input
                  id="author-name"
                  value={form.name}
                  onChange={(event) => setFormField("name", event.target.value)}
                />
              </Field>
              <Field label="Slug" htmlFor="author-slug" hint="Auto-derived from the name if blank">
                <Input
                  id="author-slug"
                  value={form.slug ?? ""}
                  onChange={(event) => setFormField("slug", event.target.value)}
                  placeholder={slugify(form.name || "")}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bio (EN)" htmlFor="author-bio-en">
                <textarea
                  id="author-bio-en"
                  className={cn(fieldControlClass, "min-h-[80px] resize-y")}
                  value={form.bio?.en ?? ""}
                  onChange={(event) =>
                    setFormField("bio", { ...(form.bio ?? {}), en: event.target.value })
                  }
                />
              </Field>
              <Field label="Bio (DE)" htmlFor="author-bio-de">
                <textarea
                  id="author-bio-de"
                  className={cn(fieldControlClass, "min-h-[80px] resize-y")}
                  value={form.bio?.de ?? ""}
                  onChange={(event) =>
                    setFormField("bio", { ...(form.bio ?? {}), de: event.target.value })
                  }
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {SOCIALS.map((social) => (
                <Field key={social.key} label={social.label} htmlFor={`author-${social.key}`}>
                  <Input
                    id={`author-${social.key}`}
                    value={(form[social.key] as string | null) ?? ""}
                    placeholder={social.placeholder}
                    onChange={(event) => setFormField(social.key, event.target.value)}
                  />
                </Field>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={submit}>
              {saving ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
              {form.id ? "Save author" : "Create author"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
