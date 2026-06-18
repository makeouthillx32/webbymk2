// src/agent-view/writeSnapshot.ts
// ─────────────────────────────────────────────────────────────────────────────
// Saves a PanelFrameResult to .snapshots/<timestamp>-<label>/
//   frame.txt      — plain text (agent + human readable)
//   frame.ansi     — raw ANSI with terminal colors
//   metadata.json  — full context: label, size, timing, git, version
// ─────────────────────────────────────────────────────────────────────────────

import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join, resolve }                        from 'path'
import { spawnSync }                            from 'child_process'
import type { PanelFrameResult }               from './renderPanelFrame.js'

// ── Snapshot root ─────────────────────────────────────────────────────────────

const SNAPSHOTS_DIR = resolve(process.cwd(), '.snapshots')

function snapshotDir(label: string, ts: string): string {
  const slug = label.replace(/[^a-z0-9_-]/gi, '-').toLowerCase()
  return join(SNAPSHOTS_DIR, `${ts}-${slug}`)
}

// ── Git context ───────────────────────────────────────────────────────────────

function gitContext(): Record<string, string> {
  const run = (args: string[]) => {
    const r = spawnSync('git', args, { encoding: 'utf8', timeout: 2000 })
    return r.status === 0 ? r.stdout.trim() : ''
  }
  return {
    branch: run(['rev-parse', '--abbrev-ref', 'HEAD']),
    commit: run(['rev-parse', '--short', 'HEAD']),
    dirty:  run(['status', '--porcelain']) !== '' ? 'true' : 'false',
  }
}

// ── UNAXIS version ────────────────────────────────────────────────────────────

function unaxisVersion(): string {
  try {
    const pkg = join(process.cwd(), 'src', 'ink', 'package.json')
    const { version } = JSON.parse(require('fs').readFileSync(pkg, 'utf8'))
    return version ?? 'unknown'
  } catch { return 'unknown' }
}

// ── Main export ───────────────────────────────────────────────────────────────

export type SnapshotResult = {
  dir:   string;
  files: string[];
};

export async function writeSnapshot(result: PanelFrameResult): Promise<SnapshotResult> {
  const ts  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dir = snapshotDir(result.metadata.label, ts)

  if (!existsSync(SNAPSHOTS_DIR)) mkdirSync(SNAPSHOTS_DIR, { recursive: true })
  mkdirSync(dir, { recursive: true })

  const metadata = {
    ...result.metadata,
    unaxis_version: unaxisVersion(),
    git:            gitContext(),
    cwd:            process.cwd(),
  }

  const files: string[] = []

  const write = (name: string, content: string) => {
    const p = join(dir, name)
    writeFileSync(p, content, 'utf8')
    files.push(p)
  }

  write('frame.txt',      result.text)
  write('frame.ansi',     result.ansi)
  write('metadata.json',  JSON.stringify(metadata, null, 2))

  return { dir, files }
}
