import { access } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listFiles } from '../src/util.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const EXPECTED = [
  { path: '.claude/sdd/architecture/WORKFLOW_CONTRACTS.yaml', kind: 'file' },
  { path: '.claude/sdd/templates', kind: 'dir', minFiles: 5 },
  { path: '.claude/commands/workflow', kind: 'dir', minFiles: 7 },
  { path: '.claude/agents/workflow', kind: 'dir', minFiles: 6 }
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
