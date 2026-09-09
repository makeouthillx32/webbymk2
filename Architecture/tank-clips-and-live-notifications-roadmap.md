# Tank Clips, Highlights, and Live Notifications Roadmap

Status: scoped, not implemented

This document covers two larger platform capabilities: creating shareable moments and notifying opted-in viewers when Tank goes live. Both must be server-authoritative and must not expose backstage feeds or make a viewer browser record the stream.

## Clips and highlights

### Product behavior

- Viewers may request a short clip from the recent public program buffer.
- Staff may create longer highlights and adjust start/end points within retained public footage.
- Every artifact records its source broadcast, creator, time range, visibility, moderation state, and immutable media checksum.
- Deleted, private, embargoed, or backstage footage is never eligible for public clipping.

### Processing boundary

- Maintain the clip source as a server-side rolling buffer or archived public-program segments.
- A clip request submits timestamps and metadata; a queue worker assembles the media once and stores the resulting asset.
- Clients receive progress and the completed public asset URL. They do not download every segment and encode locally.
- Deduplicate equivalent jobs and rate-limit creation per account and broadcast.

### Safety and lifecycle

- Require an authenticated identity for creation; viewing rules depend on artifact visibility.
- Run created artifacts through moderation and staff takedown controls before broad discovery.
- Define retention for source buffers, failed jobs, private drafts, and published artifacts.
- Revoking a source broadcast or privacy approval must cascade to its derived public clips.

## Streamer went-live notifications

### Subscription model

- Viewers explicitly opt in per supported channel: in-app, web push, or verified email.
- Store channel verification, consent time, locale/timezone, notification preferences, and unsubscribe state server-side.
- Provide one-action unsubscribe and a settings page that works even while Tank is offline.

### Event model

- Emit `went_live` only on an authoritative server transition from offline to live.
- Give each broadcast transition an idempotency key so reconnects and health flaps cannot fan out duplicates.
- Apply a stabilization window before dispatch and a cooldown before another notification for the same broadcast.
- Queue delivery outside the request path, track provider results, and retry only transient failures.

### Privacy and operations

- Public clients receive only their own subscription state.
- Provider secrets, recipient lists, and delivery logs remain backstage.
- Record consent and suppression events without placing private recipient data in general application logs.
- Add delivery health, bounce, complaint, and unsubscribe metrics before enabling email at scale.

## Suggested delivery sequence

1. Define public-program archive eligibility and retention.
2. Build staff-only clip creation and moderation.
3. Add viewer clip requests with rate limits.
4. Add in-app live subscriptions and idempotent broadcast events.
5. Add web push, then verified email after consent and suppression flows are proven.

## Acceptance checks

- Clip encoding occurs once server-side and succeeds with the viewer page closed.
- A clip can never reference a private camera or backstage-only interval.
- Duplicate create requests resolve to one artifact or one active job.
- One offline-to-live transition sends at most one notification per subscribed destination.
- Reconnects, Director room navigation, and camera switching do not count as a new live event.
- Unsubscribed or unverified destinations never receive delivery attempts.

