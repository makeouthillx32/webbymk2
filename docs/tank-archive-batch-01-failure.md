# Tank Archive Incident Report — Failed Batch 01 (Chunked Segments)

**Status**: ❌ FAILED BATCH DECOMMISSIONED & PURGED  
**Date**: 2026-08-21  
**Target Architecture Requirement**: Full 24-Hour Continuous Timeline Per Room/Camera  
**Failure Cause**: Fragmented 10-minute / 15-minute chunked slices (`fmp4` segmenting)

---

## 1. Executive Summary
The initial archiving implementation (Batch 01) attempted to record live camera feeds using standard MediaMTX short-duration segment splitting (`10m`/`15m` slices).

This batch failed the core archive evaluation test:
* **Product Expectation**: A single, cohesive 24-hour full-length recording per day per room.
* **Observed Failure**: The recording pipeline generated hundreds of disjointed, multi-part sub-files (`2026-08-21_04-18-27-052118.mp4`, etc.) scattered across Supabase Storage and `tank_archive_segments`.
* **User & Operator Impact**: Viewers and moderators were faced with hundreds of fractured video clips instead of an unbroken 24-hour broadcast rewind.

---

## 2. Actions Executed
1. **Pipeline Shutdown**:
   * Set `getArchiveRungConfig().enabled` to `false` in `mediaGateway.ts`.
   * Halted MediaMTX archive rungs and recording hooks across all camera paths.
2. **Complete Data & Storage Purge**:
   * Removed all rows from `public.tank_archives`.
   * Removed all 306 fragmented segment rows from `public.tank_archive_segments`.
   * Purged all 455 uploaded video chunk files from Supabase Storage bucket `tank-archives`.
3. **Registry Reconciliation**:
   * Validated that database tables `tank_archives` and `tank_archive_segments` have 0 orphan records.
   * Validated that bucket `tank-archives` has 0 remaining segment objects.

---

## 3. Post-Mortem & Architecture Directives for Batch 02
For the next iteration of the archiving architecture (Batch 02):
* **24-Hour Monolithic Aggregation**: The recording pipeline must aggregate a full 24-hour continuous broadcast day (e.g. 00:00:00 to 23:59:59 UTC/Local) into a single master video stream or seamless HLS manifest.
* **No Client Fragmentation**: The client experience must load one unified scrubber per day per room rather than navigating dozens of separate 10-minute MP4 files.
