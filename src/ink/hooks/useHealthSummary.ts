// src/ink/hooks/useHealthSummary.ts
// ─────────────────────────────────────────────────────────────────────────────
// Derives a system-wide health summary for display on the WelcomeScreen.
//
// Three signal sources:
//   1. infraResults  — passed in from the parent (already being checked by
//                      useEnvManager); no extra fetch needed.
//   2. DB instances  — loadRegistry() reads instances.json from disk (~1 ms,
//                      no IPC required).
//   3. SSL certs     — npmListHosts(?expand=certificate) from npm-api.ts;
//                      runs once on mount, then every CERT_REFRESH_MS.
//
// All three are independent: infra state updates live while the other two
// are loaded lazily.  The bar renders immediately with whatever is available
// and fills in as data arrives.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from '../reactRuntime.js'
import type { ServiceResult }  from '../infra.js'
import { loadRegistry }        from '../zone/supabase-factory.js'
import { npmListHosts }        from '../npm-api.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HealthSummary {
  /** Count of infra services with status === "down" */
  servicesDown:    number
  /** Count of running DB instances with healthState === "degraded" | "down" */
  dbDegraded:      number
  /** Count of stopped DB instances (not "running") */
  dbStopped:       number
  /** Count of NPM proxy hosts with an already-expired SSL cert */
  sslExpired:      number
  /** Count of NPM proxy hosts with a cert expiring within WARN_DAYS days */
  sslExpiringSoon: number
  /** true while SSL data hasn't returned yet */
  sslLoading:      boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Days before expiry that we start warning */
const WARN_DAYS = 14

/** How often to re-check certs (ms) — 10 minutes */
const CERT_REFRESH_MS = 10 * 60 * 1000

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useHealthSummary(
  infraResults: Record<string, ServiceResult>
): HealthSummary {

  // ── 1. Services down — derived synchronously from infraResults ─────────────
  const servicesDown = Object.values(infraResults).filter(
    (r) => r.status === "down"
  ).length

  // ── 2. DB instance health — loaded from instances.json ────────────────────
  const [dbDegraded, setDbDegraded] = useState(0)
  const [dbStopped,  setDbStopped]  = useState(0)

  useEffect(() => {
    let cancelled = false
    loadRegistry().then((instances) => {
      if (cancelled) return
      let degraded = 0
      let stopped  = 0
      for (const inst of instances) {
        if (inst.status !== "running") {
          stopped++
        } else if (inst.healthState === "degraded" || inst.healthState === "down") {
          degraded++
        }
      }
      setDbDegraded(degraded)
      setDbStopped(stopped)
    }).catch(() => { /* instances.json missing on fresh installs — silently skip */ })
    return () => { cancelled = true }
  }, [])

  // ── 3. SSL cert health — fetched from NPM API ─────────────────────────────
  const [sslExpired,      setSslExpired]      = useState(0)
  const [sslExpiringSoon, setSslExpiringSoon] = useState(0)
  const [sslLoading,      setSslLoading]      = useState(true)

  useEffect(() => {
    let cancelled = false

    async function checkCerts() {
      try {
        const hosts = await npmListHosts()
        if (cancelled) return

        const nowMs   = Date.now()
        const warnMs  = WARN_DAYS * 24 * 60 * 60 * 1000
        let expired   = 0
        let warnCount = 0

        for (const host of hosts) {
          const expiresOn = host.certificate?.expires_on
          if (!expiresOn) continue
          const expiresMs = new Date(expiresOn).getTime()
          if (isNaN(expiresMs)) continue
          const msLeft = expiresMs - nowMs
          if (msLeft <= 0) {
            expired++
          } else if (msLeft <= warnMs) {
            warnCount++
          }
        }

        setSslExpired(expired)
        setSslExpiringSoon(warnCount)
      } catch {
        // NPM unreachable (e.g. edge node offline) — suppress, don't show SSL data
      } finally {
        if (!cancelled) setSslLoading(false)
      }
    }

    checkCerts()
    const id = setInterval(checkCerts, CERT_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return { servicesDown, dbDegraded, dbStopped, sslExpired, sslExpiringSoon, sslLoading }
}
