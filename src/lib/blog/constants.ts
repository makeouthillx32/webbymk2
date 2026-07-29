// lib/blog/constants.ts

export const BLOG_ORIGIN = "https://blog.unenter.live";

/** Scheme used inside post markdown to reference a post's own image slot. */
export const POST_REF_SCHEME = "post://";

/** The cover slot is special: it fills `cover_image` rather than the body. */
export const COVER_SLOT = "cover";

/** Numbered body slots are `image-1`, `image-2`, … */
export const IMAGE_SLOT_PREFIX = "image-";

/** Storage folder holding a post's slot images. */
export const POST_IMAGE_FOLDER = "posts";

/** Folder for inline images that are not tied to a numbered slot. */
export const LOOSE_IMAGE_FOLDER = "posts/unattached";
