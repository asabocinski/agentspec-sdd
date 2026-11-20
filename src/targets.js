import { basename, extname, join } from 'node:path'
import { copyFile, mkdir, rm } from 'node:fs/promises'
import { pruneEmptyDirs, readManifest, removeRecordedFiles, MANIFEST_NAME } from './manifest.js'
import {
  ensureDir,
  isTextAsset,
  listFiles,
  pathExists,
  readText,
  rewritePaths,
  writeIfAllowed
} from './util.js'
import {
  buildAgentsDoc,
  decorateSddDoc,
  parseAsset,
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

const isCommandAsset = (file) => extname(file) === '.md' && basename(file) !== 'README.md'

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

  if (!options.dryRun) await rm(join(root, MANIFEST_NAME), { force: true })

  const pruned = await pruneEmptyDirs(root, options)

  return { root, outcome, pruned }
}

export const uninstallClaude = (options) => uninstall('claude', 'Claude Code', options)
export const uninstallCodex = (options) => uninstall('codex', 'Codex', options)

/**
 * Claude Code target: the payload is already in its native format, so this is a
 * verbatim copy into `.claude/`.
 */
export async function installClaude (payload, options, report) {
  const root = join(options.dir, '.claude')
  const render = (content, file) => rewritePaths(decorateSddDoc(content, file, '.claude'), 'claude')

  await copyTree(payload.sdd, join(root, 'sdd'), options, report, render)
  // README.md is excluded: anything under commands/ is discovered as a slash
  // command, so shipping it would surface a bogus /README.
  for (const dir of payload.commands) {
    await copyTree(dir, join(root, 'commands', basename(dir)), options, report, render, isCommandAsset)
  }

  await copyTree(payload.agents, join(root, 'agents'), options, report, render)
  await copyTree(payload.kb, join(root, 'kb'), options, report, render)

  for (const dir of WORKING_DIRS) {
    await ensureDir(join(root, 'sdd', dir), options)
  }

  return { root, note: 'Restart Claude Code, then run /workflow:define to start the workflow.' }
}

/**
 * Codex target: SDD documents are copied with their paths rewritten, commands
 * become native prompts, agents become skills, and AGENTS.md points at all of it.
 */
export async function installCodex (payload, options, report) {
  const root = join(options.dir, '.codex')

  const render = (content, file) => rewritePaths(decorateSddDoc(content, file, '.codex'), 'codex')

  await copyTree(payload.sdd, join(root, 'sdd'), options, report, render)
  await copyTree(payload.kb, join(root, 'kb'), options, report, render)

  for (const dir of WORKING_DIRS) {
    await ensureDir(join(root, 'sdd', dir), options)
  }

  const commands = []
  for (const dir of payload.commands) {
    for (const file of await listFiles(dir)) {
      if (!isCommandAsset(file)) continue
      const source = await readText(join(dir, file))
      const prompt = toCodexPrompt(source, basename(file, '.md'))
      const { attrs } = parseAsset(source)

      commands.push({ name: prompt.name, description: attrs.description ?? '' })
      await writeIfAllowed(join(root, 'prompts', `${prompt.name}.md`), prompt.content, options, report)
    }
  }

  const agents = []
  for (const file of await listFiles(payload.agents)) {
    if (!isAgentAsset(file)) continue
    const source = await readText(join(payload.agents, file))
    const skill = toCodexSkill(source, basename(file, '.md'))

    agents.push({ name: skill.name, category: categoryOf(file) })
    await writeIfAllowed(join(root, 'skills', skill.name, 'SKILL.md'), skill.content, options, report)
  }

  // Written inside .codex/, never at the project root: the root AGENTS.md belongs
  // to the project and this installer must not create or modify it.
  await writeIfAllowed(
    join(root, 'AGENTS.md'),
    buildAgentsDoc(commands, agents),
    options,
    report
  )

  return {
    root,
    note: 'Prompts are available as slash commands; start with /define.',
    hint: 'To let Codex find the workflow, add one line to your own AGENTS.md:\n' +
      '      See .codex/AGENTS.md for the AgentSpec SDD workflow.'
  }
}

async function copyTree (from, to, options, report, transform, filter) {
  for (const file of await listFiles(from)) {
    if (basename(file) === '.gitkeep') continue
    if (filter && !filter(file)) continue

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
