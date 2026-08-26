---
title: What is unenter.live?
summary: One domain, many apps, all run by one operator system on our own hardware.
order: 1
---

# What is unenter.live?

**unenter.live is a self-hosted app platform.** One domain, many independent apps — we call them **zones** — all running on hardware we own and operate ourselves. No rented cloud platform, no vendor lock-in, no monthly platform bill deciding what we can build.

## How it works, in plain words

Every zone (like `shop.unenter.live` or `blog.unenter.live`) is its own app:

- **The code** lives in git.
- **The app** is packaged into a container image and deployed automatically.
- **The data** is captured in snapshots that can rebuild everything.

That's the whole system. A project is just *code + data* — everything else can be rebuilt from those two things at any time.

## UNAXIS — the operator

The platform is run by **UNAXIS**, a terminal-based control plane built in-house. It builds, ships, monitors, backs up, and repairs every zone from one place. Every operation is visible, logged, and reversible.

UNAXIS isn't off-the-shelf software. It's a custom system with its own rendering engine, its own CLI, and its own agents coordinating multiple machines — built because nothing existing did the job the way we wanted.

## Why self-hosted?

- **Ownership** — our hardware, our data, our rules.
- **Cost** — no per-seat, per-build, or per-request platform fees.
- **Speed** — code to live deploy in one command.
- **Resilience** — snapshots and backups held by our own systems, restorable in minutes.

## Explore

- [Services — what we offer](/services)
- [Tyler — the developer](/tyler)
- [Operator guide — how the platform is run](/operator)
