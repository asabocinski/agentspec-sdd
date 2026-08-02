import { readdir, mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'

const ESC = '\u001b'
const useColor = process.stdout.isTTY && !process.env.NO_COLOR

const paint = (code) => (text) =>
  useColor ? `${ESC}[${code}m${text}${ESC}[0m` : text

export const style = {
  bold: paint('1'),
  dim: paint('2'),
  green: paint('32'),
  yellow: paint('33'),
  cyan: paint('36'),
  red: paint('31')
}

export function createReport () {
  return { created: [], skipped: [], updated: [] }
}

export async function pathExists (target) {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

export async function listFiles (root) {
  const entries = await readdir(root, { withFileTypes: true, recursive: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath ?? entry.path, entry.name)))
}

export async function ensureDir (target, options) {
  if (options.dryRun) return
  await mkdir(target, { recursive: true })
}

export function readText (path) {
  return readFile(path, 'utf8')
}

/**
 * Writes a file unless it already exists, which requires --force. Every write is
 * recorded in the report so the CLI can summarise what actually changed on disk.
 */
export async function writeIfAllowed (path, content, options, report) {
  const label = relative(options.dir, path) || path
  const exists = await pathExists(path)

  if (exists && !options.force) {
    report.skipped.push(label)
    return false
  }

  if (!options.dryRun) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content, 'utf8')
  }

  ;(exists ? report.updated : report.created).push(label)
  return true
}

/**
 * Rewrites `.claude/...` references to their Codex equivalents. Order matters:
 * the most specific prefixes must resolve before the generic `.claude/` catch-all.
 */
const CODEX_PATH_REWRITES = [
  ['.claude/commands/workflow/', '.codex/prompts/'],
  ['.claude/commands/', '.codex/prompts/'],
  ['.claude/agents/workflow/', '.codex/skills/'],
  ['.claude/agents/', '.codex/skills/'],
  ['.claude/CLAUDE.md', 'AGENTS.md'],
  ['.claude/', '.codex/']
]

export function rewriteForCodex (text) {
  return CODEX_PATH_REWRITES.reduce(
    (result, [from, to]) => result.split(from).join(to),
    text
  )
}

export const isTextAsset = (path) => /\.(md|ya?ml|json|txt)$/i.test(path)
