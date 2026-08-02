import { basename, extname, join } from 'node:path'
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { pruneEmptyDirs, readManifest, removeRecordedFiles, MANIFEST_NAME } from './manifest.js'
import {
  ensureDir,
  isTextAsset,
  listFiles,
  pathExists,
  readText,
  rewriteForCodex,
  writeIfAllowed
} from './util.js'
import {
  buildAgentsSection,
  decorateSddDoc,
  mergeAgentsMd,
  parseAsset,
  stripAgentsSection,
  toCodexPrompt,
  toCodexSkill
} from './convert.js'

const WORKING_DIRS = ['features', 'reports', 'archive']

const NON_AGENT_FILES = new Set(['README.md', '_template.md'])

/**
 * Agent assets live one level down, under a category directory. Everything at the
 * root of `agents/` is documentation (README, template), not a deployable agent.
 */
const isAgentAsset = (file) =>
  file.includes('/') && extname(file) === '.md' && !NON_AGENT_FILES.has(basename(file))

const categoryOf = (file) => file.split('/')[0]

/**
 * Shared uninstall path. Only files recorded in the manifest are touched, so user
 * work under `sdd/features/` and any agents added by hand survive untouched.
 */
async function uninstall (targetKey, label, options) {
  const root = join(options.dir, `.${targetKey === 'claude' ? 'claude' : 'codex'}`)
  const manifest = await readManifest(root)

  if (!manifest) {
    throw new Error(
      `no ${label} install found at ${root}\n` +
      `Expected a manifest at ${join(root, MANIFEST_NAME)}. If this was installed with an\n` +
      'older version, delete the directory by hand — there is no record of what to remove.'
    )
  }

  const outcome = await removeRecordedFiles(manifest, options)

  for (const file of manifest.managedBlocks ?? []) {
    await stripManagedBlock(join(options.dir, file), options, outcome)
  }

  if (!options.dryRun) await rm(join(root, MANIFEST_NAME), { force: true })

  const pruned = await pruneEmptyDirs(root, options)

  return { root, outcome, pruned }
}

async function stripManagedBlock (path, options, outcome) {
  if (!(await pathExists(path))) return

  const stripped = stripAgentsSection(await readText(path))
  if (stripped === null) return

  if (!options.dryRun) {
    if (stripped === '') await rm(path, { force: true })
    else await writeFile(path, stripped, 'utf8')
  }

  outcome.removed.push(stripped === '' ? 'AGENTS.md' : 'AGENTS.md (managed block only)')
}

export const uninstallClaude = (options) => uninstall('claude', 'Claude Code', options)
export const uninstallCodex = (options) => uninstall('codex', 'Codex', options)

/**
 * Claude Code target: the payload is already in its native format, so this is a
 * verbatim copy into `.claude/`.
 */
export async function installClaude (payload, options, report) {
  const root = join(options.dir, '.claude')

  await copyTree(payload.sdd, join(root, 'sdd'), options, report, (content, file) =>
    decorateSddDoc(content, file, '.claude'))
  await copyTree(payload.commands, join(root, 'commands', 'workflow'), options, report)
  await copyTree(payload.agents, join(root, 'agents'), options, report)

  for (const dir of WORKING_DIRS) {
    await ensureDir(join(root, 'sdd', dir), options)
  }

  return { root, note: 'Run /define to start the workflow.' }
}

/**
 * Codex target: SDD documents are copied with their paths rewritten, commands
 * become native prompts, agents become skills, and AGENTS.md points at all of it.
 */
export async function installCodex (payload, options, report) {
  const root = join(options.dir, '.codex')

  await copyTree(payload.sdd, join(root, 'sdd'), options, report, (content, file) =>
    rewriteForCodex(decorateSddDoc(content, file, '.codex')))

  for (const dir of WORKING_DIRS) {
    await ensureDir(join(root, 'sdd', dir), options)
  }

  const commands = []
  for (const file of await listFiles(payload.commands)) {
    if (extname(file) !== '.md') continue
    const source = await readText(join(payload.commands, file))
    const prompt = toCodexPrompt(source, basename(file, '.md'))
    const { attrs } = parseAsset(source)

    commands.push({ name: prompt.name, description: attrs.description ?? '' })
    await writeIfAllowed(join(root, 'prompts', `${prompt.name}.md`), prompt.content, options, report)
  }

  const agents = []
  for (const file of await listFiles(payload.agents)) {
    if (!isAgentAsset(file)) continue
    const source = await readText(join(payload.agents, file))
    const skill = toCodexSkill(source, basename(file, '.md'))

    agents.push({ name: skill.name, category: categoryOf(file) })
    await writeIfAllowed(join(root, 'skills', skill.name, 'SKILL.md'), skill.content, options, report)
  }

  await writeAgentsMd(options, report, commands, agents)

  return { root, note: 'Prompts are available as slash commands; start with /define.' }
}

/**
 * AGENTS.md is the one file that is always merged rather than skipped: it is the
 * entry point Codex reads, and the managed block is delimited so hand-written
 * content around it survives re-runs.
 */
async function writeAgentsMd (options, report, commands, agents) {
  const target = join(options.dir, 'AGENTS.md')
  const existing = (await pathExists(target)) ? await readText(target) : ''
  const merged = mergeAgentsMd(existing, buildAgentsSection(commands, agents))

  if (existing === merged) {
    report.skipped.push('AGENTS.md')
    return
  }

  if (!options.dryRun) {
    await mkdir(options.dir, { recursive: true })
  }

  await writeIfAllowed(target, merged, { ...options, force: true }, report)
}

async function copyTree (from, to, options, report, transform) {
  for (const file of await listFiles(from)) {
    if (basename(file) === '.gitkeep') continue

    const source = join(from, file)
    const target = join(to, file)

    if (transform && isTextAsset(file)) {
      await writeIfAllowed(target, transform(await readText(source), file), options, report)
      continue
    }

    await copyBinary(source, target, options, report)
  }
}

async function copyBinary (source, target, options, report) {
  const label = target.replace(`${options.dir}/`, '')

  if ((await pathExists(target)) && !options.force) {
    report.skipped.push(label)
    return
  }

  const existed = await pathExists(target)

  if (!options.dryRun) {
    await mkdir(join(target, '..'), { recursive: true })
    await copyFile(source, target)
  }

  ;(existed ? report.updated : report.created).push(label)
}
