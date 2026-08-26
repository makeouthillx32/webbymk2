# Peptide Request — HTTP Contracts (Legacy Spec)

**Date:** 2026-04-17
**Status:** Frozen Contract Specification

This document is the reference HTTP surface specification ported from `Accu-Mk1`.

---

## Auth mechanisms

| Name | Used where | Mechanism |
|---|---|---|
| **WP-JWT** | Customer-initiated WP → integration-service | Existing WP → integration-service JWT bearer; customer identity derived from token |
| **Service-Secret** | integration-service ↔ Accu-Mk1 / webbymk2 | Shared secret header `X-Service-Token`; rotated via env var |
| **ClickUp-Sig** | ClickUp → webbymk2 webhook | `X-Signature` header, HMAC-SHA256(secret, raw_body), constant-time compare |

---

## Shared Types

### `PeptideRequest`

```json
{
  "id": "018e9c20-9b0f-7b3a-9c1f-f7d3e9c3b1a2",
  "created_at": "2026-04-17T14:32:10Z",
  "updated_at": "2026-04-17T14:35:02Z",
  "submitted_by_wp_user_id": 4821,
  "submitted_by_email": "customer@example.com",
  "submitted_by_name": "Jane Customer",
  "compound_kind": "peptide",
  "compound_name": "Retatrutide",
  "vendor_producer": "PepMart Labs",
  "molecular_weight": 4731.3,
  "cas_or_reference": "2381089-83-2",
  "status": "in_process",
  "clickup_task_id": "86a1m2z"
}
```

### `Status` enum

```
new | approved | ordering_standard | sample_prep_created | in_process | on_hold | completed | rejected | cancelled
```
