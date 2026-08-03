import { createHash } from 'node:crypto'
import { readFile, writeFile, rm, readdir, rmdir } from 'node:fs/promises'
import { join, relative, dirname } from 'node:path'
import { pathExists } from './util.js'

export const MANIFEST_NAME = '.agentspec-rdd.json'

const hash = (content) => createHash('sha256').update(content).digest('hex').slice(0, 16)

/**
 * Records every file the installer wrote, with a content hash. Uninstall uses the
 * hash to tell an untouched file (safe to delete) from one the user edited.
 */
export async function writeManifest (root, target, version, report, options) {
  const previous = await readManifest(root)
  const merged = new Map((previous?.files ?? []).map((entry) => [entry.path, entry]))

  for (const path of [...new Set([...report.created, ...report.updated])]) {
    const absolute = join(options.dir, path)
    if (!(await pathExists(absolute))) continue
    merged.set(path, { path, sha256: hash(await readFile(absolute)) })
  }

  const manifest = {
    package: 'agentspec-rdd',
    version,
    target,
    installedAt: new Date().toISOString(),
    files: [...merged.values()].sort((a, b) => a.path.localeCompare(b.path))
  }

  if (!options.dryRun) {
    await writeFile(join(root, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  }

  return manifest
}

export async function readManifest (root) {
  const path = join(root, MANIFEST_NAME)
  if (!(await pathExists(path))) return null

  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    throw new Error(`manifest at ${path} is corrupt; remove the directory manually`)
  }
}

/**
 * Deletes a recorded file only when its content still matches what was installed.
 * Edited files are kept unless --force, so local changes are never lost silently.
 */
export async function removeRecordedFiles (manifest, options) {
  const removed = []
  const kept = []
  const missing = []

  for (const entry of manifest.files) {
    const absolute = join(options.dir, entry.path)

    if (!(await pathExists(absolute))) {
      missing.push(entry.path)
      continue
    }

    if (hash(await readFile(absolute)) !== entry.sha256 && !options.force) {
      kept.push(entry.path)
      continue
    }

    if (!options.dryRun) await rm(absolute, { force: true })
    removed.push(entry.path)
  }

  return { removed, kept, missing }
}

/**
 * Removes directories left empty by the uninstall, deepest first, stopping at the
 * project directory. Anything the user still has in there keeps its parents alive.
 */
export async function pruneEmptyDirs (root, options) {
  if (options.dryRun) return []

  const pruned = []
  const seen = new Set()

  const collect = async (dir) => {
    if (seen.has(dir) || !(await pathExists(dir))) return
    seen.add(dir)

    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) await collect(join(dir, entry.name))
    }
  }

  await collect(root)

  for (const dir of [...seen].sort((a, b) => b.length - a.length)) {
    try {
      await rmdir(dir)
      pruned.push(relative(options.dir, dir))
    } catch {
      // Directory still has content: leave it and everything above it alone.
    }
  }

  return pruned
}

export const manifestDir = (path) => dirname(path)
