# Blog Ingest API — payload reference

Programmatic blog posting for agents, bots, and the future MCP server.
Two endpoints, one token.

## Auth

Every request needs:

```
Authorization: Bearer <BLOG_INGEST_TOKEN>
```

`BLOG_INGEST_TOKEN` is a server env var on the core app container. Rotate it by
changing the env and restarting. Until it is set, the API answers 401.

## Command payloads for agents and MCP

All programmatic operations use `POST /api/blog/ingest`. Existing post payloads
without a `command` remain valid.

| Command | Payload | Result |
|---------|---------|--------|
| `post.upsert` | Full post payload below | Creates or updates one post. The command may be omitted for backward compatibility. |
| `tags.list` | `{ "command": "tags.list" }` | Returns every current tag as `{ id, slug, name }`. |
| `tags.resolve` | `{ "command": "tags.resolve", "tags": ["existing", "new tag"] }` | Finds existing tags, creates missing tags, and returns each canonical tag with `created: true/false`. |

Examples:

```json
{ "command": "tags.list" }
```

```json
{
  "command": "tags.resolve",
  "tags": ["engineering", "field-notes"]
}
```

These commands use the same bearer token as post ingestion, so an API client or
MCP tool can inspect the current vocabulary before resolving new names.

## Endpoint 1 — one-shot post with images

`POST https://www.unenter.live/api/blog/ingest` (JSON)

This is the "I'm in Discord / an agent session with a .md file and some
pictures" flow. Embed the pictures as base64 in `images[]`, reference them in
the markdown as `attachment://<name>`, and the server uploads them, rewrites
the URLs, and creates (or updates) the post — one request.

```json
{
  "command": "post.upsert",
  "slug": "my-new-post",
  "title":   { "en": "My New Post", "de": "Mein neuer Beitrag" },
  "excerpt": { "en": "One-line subtitle shown in the hero and cards." },
  "content": {
    "en": "## Hello\n\nHere is a picture:\n\n![The lab](attachment://lab-photo)\n\n```ts\nconst works = true;\n```"
  },
  "cover_image": "attachment://cover",
  "author": "Unenter Team",
  "tags": ["engineering", "news"],
  "publish": true,
  "images": [
    { "name": "cover",     "data": "<base64…>", "content_type": "image/jpeg", "alt": "Cover art" },
    { "name": "lab-photo", "data": "<base64…>", "content_type": "image/png",  "alt": "The lab"   }
  ]
}
```

Response:

```json
{
  "ok": true,
  "data": {
    "command": "post.upsert",
    "id": "…uuid…",
    "slug": "my-new-post",
    "url": "https://blog.unenter.live/my-new-post",
    "published": true,
    "images": {
      "cover":     "https://…/blog-images/ingest/my-new-post/…-cover.jpg",
      "lab-photo": "https://…/blog-images/ingest/my-new-post/…-lab-photo.png"
    }
  }
}
```

### Field rules

| Field          | Rules |
|----------------|-------|
| `command`      | optional `post.upsert`; omitted payloads retain the original behavior. |
| `slug`         | optional; lowercase `a-z0-9-`, max 96. Derived from `title.en` if omitted. **Upsert key** — same slug updates the existing post. |
| `title`        | required; `title.en` must be non-empty. `de` optional. |
| `excerpt`      | optional; shown in hero subtitle + cards. |
| `content`      | required; `content.en` non-empty. **Markdown** (GFM: tables, code fences with language, headings get anchors + auto-TOC). |
| `cover_image`  | https URL **or** `attachment://<name>`. |
| `author`       | optional name; found or created in `blog_authors` by slugified name. |
| `tags`         | up to 12 names; found or created; replaces the post's tag set. |
| `images`       | up to 10; each ≤ 8 MB decoded. `name` = `[\w][\w.-]*`. `data` = base64 (a `data:image/…;base64,` prefix is tolerated). |
| `publish`      | `false` (default) creates a draft; `true` publishes (stamps `published_at` now unless given). |
| `published_at` | optional ISO 8601 with offset, e.g. `2026-07-14T09:00:00+02:00`. |

Every `attachment://` reference must match an entry in `images[]` or the whole
payload is rejected — no half-broken posts.

### Errors

| Status | Code                | Meaning |
|--------|---------------------|---------|
| 401    | `UNAUTHORIZED`      | missing/wrong token, or token not configured |
| 413    | `IMAGE_TOO_LARGE`   | an image exceeds 8 MB decoded |
| 422    | `VALIDATION_FAILED` | payload rejected — `error.details` has zod field errors |
| 500    | `POST_FAILED` etc.  | database/storage error, message included |

Nothing reaches the database on any 4xx.

### Dashboard tag command

The authenticated dashboard create/edit routes accept this command alongside
the normal post fields:

```json
{
  "tag_command": {
    "command": "tags.replace",
    "tag_ids": ["tag-uuid-1", "tag-uuid-2"]
  }
}
```

`tag_ids` remains accepted as a legacy shortcut. The dashboard tag picker uses
`tags.replace` so create and edit share the same explicit payload contract.

## Endpoint 2 — images first, post later

`POST https://www.unenter.live/api/blog/ingest/images`

For bots that already have file bytes in hand (e.g. Discord attachments) —
upload first, get URLs, then send the post referencing those URLs directly.

Multipart (what a Discord bot forwards):

```bash
curl -X POST https://www.unenter.live/api/blog/ingest/images \
  -H "Authorization: Bearer $BLOG_INGEST_TOKEN" \
  -F "files=@cover.jpg" -F "files=@diagram.png"
```

Or JSON base64: `{ "images": [{ "name": "cover", "data": "<base64…>" }] }`

Response: `{ "ok": true, "data": { "images": { "cover.jpg": "https://…" } } }`

Then use those URLs as plain `![alt](https://…)` in the markdown and skip
`images[]` in the ingest call.

## Complete example — .md file + pictures from a shell/agent

```bash
# 1. base64 the pictures
COVER=$(base64 -w0 cover.jpg)
PHOTO=$(base64 -w0 photo.png)

# 2. read the markdown file into the payload (jq handles escaping)
jq -n \
  --arg md "$(cat post.md)" \
  --arg cover "$COVER" --arg photo "$PHOTO" \
  '{
    title:   { en: "Post from the field" },
    excerpt: { en: "Written in an agent session." },
    content: { en: $md },
    cover_image: "attachment://cover",
    author: "Unenter Team",
    tags: ["field-notes"],
    publish: true,
    images: [
      { name: "cover", data: $cover, content_type: "image/jpeg" },
      { name: "photo", data: $photo, content_type: "image/png"  }
    ]
  }' > payload.json

# 3. ship it
curl -X POST https://www.unenter.live/api/blog/ingest \
  -H "Authorization: Bearer $BLOG_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  --data @payload.json
```

Inside `post.md`, reference the photo wherever it belongs:

```markdown
## What we found

![Measurement rig](attachment://photo)
```

## Predictable image slots — `post://<slot>`

Every post's images live at a deterministic path in the `blog-images` bucket:

```
posts/<slug>/cover.<ext>
posts/<slug>/image-1.<ext>
posts/<slug>/image-2.<ext>
```

Because the path is predictable, a generated `.md` can reference images that
do not exist yet:

```markdown
![Diagram](post://image-1)
```

and set `"cover_image": "post://cover"`. Resolution rules:

1. If the same request's `images[]` contains an attachment named `image-1`,
   it is uploaded to the slot path and the reference resolves immediately.
2. Otherwise the slot is looked up in `posts/<slug>/` storage (uploaded
   earlier from the dashboard's slot panel or a previous ingest).
3. If neither exists, the payload is rejected with 422 — no broken images.

Ingest uploads attachments to the slot path with upsert, so re-sending
`image-1` replaces the file and every reference follows. One slot = one file:
uploading a `.png` into a slot that held a `.jpg` evicts the old file.

`attachment://` still works and is resolved at write time (URLs baked into the
stored markdown); `post://` is resolved at read time (markdown stays clean and
files can be swapped without editing the post). Prefer `post://` for
agent-generated content.

## MCP tool mapping

- `create_blog_post` sends `command: "post.upsert"` plus the post payload.
- `list_blog_tags` sends `{ "command": "tags.list" }`.
- `resolve_blog_tags` sends `command: "tags.resolve"` plus tag names.
- `upload_blog_images` maps onto Endpoint 2.

Each tool is a single authenticated request and receives canonical IDs and
slugs from the server rather than duplicating tag normalization client-side.
