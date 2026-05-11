#!/usr/bin/env node
import { existsSync, readFileSync } from 'fs'
import { relative, resolve } from 'path'

const candidates = [
  {
    path: 'src/utils/execFileNoThrow.ts',
    classification: 'ready',
  },
  {
    path: 'src/utils/gracefulShutdown.ts',
    classification: 'ready',
  },
  {
    path: 'src/hooks/useVirtualScroll.ts',
    classification: 'parked',
  },
  {
    path: 'src/utils/messageQueueManager.ts',
    classification: 'wired-ready',
  },
  {
    path: 'src/utils/queueProcessor.ts',
    classification: 'wired-ready',
  },
  {
    path: 'src/ink/hooks/useQueueProcessor.ts',
    classification: 'wired-ready',
  },
  {
    path: 'src/utils/QueryGuard.ts',
    classification: 'wired-ready',
  },
  {
    path: 'src/utils/signal.ts',
    classification: 'ready',
  },
]

const donorTerms = [
  'Anthropic',
  'anthropic',
  'Claude',
  'CLAUDE',
  'claude',
  'clawed',
  'Clawed',
  'CLAWED',
  'agent',
  'swarm',
  'teammate',
  'Datadog',
  'analytics',
  '1P',
  'telemetry',
  'model',
  'prompt',
  'completion',
  'session resume',
  'resume hint',
  'tengu',
  'ANT',
  'Ant',
  'bootstrap/state',
  'services/analytics',
  'getClaudeConfigHomeDir',
]

function preview(line) {
  return line.length > 240 ? `${line.slice(0, 237)}...` : line
}

function matchingTerms(line) {
  return donorTerms.filter(term => {
    if (term === 'ANT' || term === 'Ant') {
      return new RegExp(`\\b${term}\\b`).test(line)
    }
    return line.includes(term)
  })
}

function scanFile(file) {
  const absPath = resolve(file.path)
  if (!existsSync(absPath)) {
    return { ...file, missing: true, matches: [] }
  }

  const content = readFileSync(absPath, 'utf8')
  const lines = content.split(/\r?\n/)
  const matches = []

  lines.forEach((line, index) => {
    const terms = matchingTerms(line)
    if (terms.length === 0) return
    matches.push({
      lineNumber: index + 1,
      terms,
      line: preview(line),
    })
  })

  return {
    ...file,
    missing: false,
    matches,
    importsReact: /from ['"]react['"]/.test(content),
    importsCompilerRuntime: /react\/compiler-runtime/.test(content),
  }
}

const results = candidates.map(scanFile)

console.log('# Runtime Primitive Prep Scan')
console.log('')
console.log(`Workspace: ${process.cwd()}`)
console.log('')

console.log('| File | Classification | Matches | React | compiler-runtime |')
console.log('| --- | --- | ---: | --- | --- |')
for (const result of results) {
  const file = relative(process.cwd(), resolve(result.path)).replaceAll('\\', '/')
  const react = result.importsReact ? 'yes' : 'no'
  const compiler = result.importsCompilerRuntime ? 'yes' : 'no'
  console.log(
    `| \`${file}\` | ${result.classification} | ${result.matches.length} | ${react} | ${compiler} |`,
  )
}

console.log('')
console.log('## Donor-Term Matches')
for (const result of results) {
  const file = relative(process.cwd(), resolve(result.path)).replaceAll('\\', '/')
  console.log('')
  console.log(`### ${file}`)
  if (result.missing) {
    console.log('Missing file.')
    continue
  }
  if (result.matches.length === 0) {
    console.log('No donor-term matches.')
    continue
  }
  for (const match of result.matches) {
    console.log(
      `- ${file}:${match.lineNumber} [${match.terms.join(', ')}] ${match.line}`,
    )
  }
}
