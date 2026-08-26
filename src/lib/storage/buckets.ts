// lib/storage/buckets.ts
// Bucket names in one place. Import these instead of typing string literals —
// a typo'd bucket silently uploads nowhere useful and is painful to trace.

export const STORAGE_BUCKETS = {
  attachments: "attachments",
  avatars: "avatars",
  blogImages: "blog-images",
  categoryCovers: "category-covers",
  collectionCovers: "collection-covers",
  documents: "documents",
  documentThumbnails: "document-thumbnails",
  heroImages: "hero-images",
  productImages: "product-images",
  punchcards: "punchcards",
  shippingLabels: "shipping-labels",
  siteAssets: "site-assets",
  tankAssets: "tank-assets",
  tankAvatars: "tank-avatars",
  tankArt: "tank-art",
  tankEmoji: "tank-emoji",
  tankEmojis: "tank-emojis",
  tankItems: "tank-items",
  tankSoundboard: "tank-soundboard",
} as const;

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

/** Buckets served publicly — safe to hand a getPublicUrl() result to the browser. */
export const PUBLIC_BUCKETS: StorageBucket[] = [
  STORAGE_BUCKETS.avatars,
  STORAGE_BUCKETS.blogImages,
  STORAGE_BUCKETS.categoryCovers,
  STORAGE_BUCKETS.collectionCovers,
  STORAGE_BUCKETS.documentThumbnails,
  STORAGE_BUCKETS.heroImages,
  STORAGE_BUCKETS.productImages,
  STORAGE_BUCKETS.punchcards,
  STORAGE_BUCKETS.siteAssets,
  STORAGE_BUCKETS.tankAssets,
  STORAGE_BUCKETS.tankAvatars,
  STORAGE_BUCKETS.tankArt,
  STORAGE_BUCKETS.tankEmoji,
  STORAGE_BUCKETS.tankEmojis,
  STORAGE_BUCKETS.tankItems,
  STORAGE_BUCKETS.tankSoundboard,
];

export const BLOG_IMAGE_BUCKET = STORAGE_BUCKETS.blogImages;
