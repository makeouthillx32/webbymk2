// lib/landing/landing-api.ts

export type HeroSlide = {
  id: string;
  bucket_name: string;
  object_path: string;
  alt_text: string | null;
  pill_text: string | null;
  headline_line1: string;
  headline_line2: string | null;
  subtext: string | null;
  primary_button_label: string;
  primary_button_href: string;
  secondary_button_label: string | null;
  secondary_button_href: string | null;
  text_alignment: "left" | "center" | "right";
  text_color: "dark" | "light";
  position: number;
  is_active: boolean;
  blurhash: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
  updated_at: string;
};

export type StaticPage = {
  id: string;
  slug: string;
  title: string;
  content: string;
  content_format: "html" | "markdown";
  meta_description: string | null;
  is_published: boolean;
  published_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: { code: string; message: string; details?: any } };
type Envelope<T> = Ok<T> | Err;

async function unwrap<T>(res: Response): Promise<T> {
  const json = (await res.json()) as Envelope<T>;
  if (!res.ok || (json as any).ok === false) {
    const e = (json as any).error ?? { message: "Request failed" };
    throw new Error(e.message || "Request failed");
  }
  return (json as Ok<T>).data;
}

/** If you’re using your existing catch-all assets proxy route */
export function publicAssetUrl(bucket: string, objectPath: string) {
  // IMPORTANT: keep slashes in objectPath; encode each segment
  const safe = objectPath
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return `/api/public/assets/${encodeURIComponent(bucket)}/${safe}`;
}

/* ---------------- HERO SLIDES ---------------- */

export async function listHeroSlides() {
  const res = await fetch("/api/landing/hero-slides", { cache: "no-store" });
  return unwrap<HeroSlide[]>(res);
}

export async function patchHeroSlide(id: string, patch: Partial<HeroSlide>) {
  const res = await fetch(`/api/landing/hero-slides/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return unwrap<HeroSlide>(res);
}

export async function reorderHeroSlides(order: { id: string; position: number }[]) {
  const res = await fetch("/api/landing/hero-slides/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order }),
  });
  return unwrap<{ updated: number }>(res);
}

export async function deleteHeroSlide(id: string) {
  const res = await fetch(`/api/landing/hero-slides/${id}`, { method: "DELETE" });
  return unwrap<{ deleted: true }>(res);
}

/* ---------------- STATIC PAGES ---------------- */

export async function listStaticPages() {
  const res = await fetch("/api/landing/static-pages", { cache: "no-store" });
  return unwrap<StaticPage[]>(res);
}

export async function patchStaticPage(id: string, patch: Partial<StaticPage>) {
  const res = await fetch(`/api/landing/static-pages/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return unwrap<StaticPage>(res);
}