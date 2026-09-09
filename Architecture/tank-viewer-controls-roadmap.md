# Tank Viewer Controls Roadmap

Status: scoped, not implemented

This document covers the viewer-control bundle that follows chat discovery. The goal is to add familiar stream controls without moving ingest, transcoding, scene composition, or Director authority into the browser.

## Scope

### Picture-in-Picture

- Expose Picture-in-Picture only when the active browser and underlying video element support it.
- Keep the selected program feed authoritative; entering Picture-in-Picture must not create another ingest or playback session.
- Reflect browser-driven Picture-in-Picture exit events back into the Tank controls.
- Verify desktop Chromium first, then treat physical iOS/WebKit behavior as Pending User Verification under the Code Yellow protocol.

### Manual quality selection

- Offer `Auto` plus only the renditions the delivery server actually publishes.
- `Auto` remains the default and may react to bandwidth, device capability, and player health.
- A manual choice pins the preferred rendition but may fall back temporarily when that rendition is unavailable; the UI must disclose the fallback.
- Do not fake quality by resizing one source or make each viewer transcode footage locally.
- Persist the preference per viewer, but reset gracefully if a saved rendition no longer exists.

### Volume and mute persistence

- Connect the existing Tank settings persistence to volume and mute state.
- Persist a normalized volume from `0` through `1` and a separate mute flag.
- Apply saved audio state after the media element mounts without bypassing browser autoplay rules.
- Keep volume local to the viewer. Director and admin controls must never change public viewer volume.

### Keyboard shortcuts

- `Space`: play or pause.
- `M`: mute or restore the saved volume.
- `F`: enter or leave fullscreen.
- Ignore shortcuts while focus is in an input, textarea, select, content-editable element, modal, or other interactive control.
- Do not intercept operating-system or browser-modified shortcuts.
- Surface shortcuts in control labels and an accessible help description.

## Architecture boundaries

- Server-side ingest, rendition production, program selection, and Director state remain authoritative.
- The client selects among already-available server outputs and retains lightweight personal preferences only.
- A second tab may have different local playback controls without changing the selected room or program for another tab.
- No receiver credentials, private camera endpoints, or backstage commands may enter the public player contract.

## Acceptance checks

- Opening Picture-in-Picture does not increase upstream camera ingest sessions.
- A saved volume/mute preference survives a fresh browser session for the same browser profile.
- Manual quality selection changes the real rendition and `Auto` can recover from a degraded network.
- Keyboard shortcuts work from the player surface and never fire while typing in chat or admin controls.
- Two tabs can independently control local playback while continuing to follow the server-selected program.

