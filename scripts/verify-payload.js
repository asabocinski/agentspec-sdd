import { access } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listFiles } from '../src/util.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const EXPECTED = [
  { path: '.base/sdd/architecture/WORKFLOW_CONTRACTS.yaml', kind: 'file' },
  { path: '.base/sdd/architecture/MODELS.yaml', kind: 'file' },
  { path: '.base/sdd/templates', kind: 'dir', minFiles: 5 },
  { path: '.base/commands/workflow', kind: 'dir', minFiles: 7 },
  { path: '.base/agents/workflow', kind: 'dir', minFiles: 6 },
  { path: '.base/commands/knowledge', kind: 'dir', minFiles: 1 },
  { path: '.base/commands/data-engineering', kind: 'dir', minFiles: 8 },
  { path: '.base/commands/core', kind: 'dir', minFiles: 4 },
  { path: '.base/commands/review', kind: 'dir', minFiles: 1 },
  { path: '.base/agents', kind: 'dir', minFiles: 42 },
  { path: '.base/kb', kind: 'dir', minFiles: 200 },
  { path: '.base/kb/_index.yaml', kind: 'file' },
  { path: '.base/kb/_templates', kind: 'dir', minFiles: 0 }
]

const failures = []

for (const expectation of EXPECTED) {
  const target = join(root, expectation.path)

  try {
    await access(target)
  } catch {
    failures.push(`missing ${expectation.path}`)
    continue
  }

  if (expectation.kind === 'dir') {
    const files = (await listFiles(target)).filter((file) => file.endsWith('.md') || file.endsWith('.yaml'))

    if (files.length < expectation.minFiles) {
      failures.push(`${expectation.path} has ${files.length} assets, expected at least ${expectation.minFiles}`)
    }
  }
}

if (failures.length) {
  console.error('payload verification failed:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('payload OK')
