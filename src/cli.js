import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { createRequire } from 'node:module'
import { createReport, pathExists, style } from './util.js'
import { installClaude, installCodex, uninstallClaude, uninstallCodex } from './targets.js'
import { writeManifest } from './manifest.js'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = createRequire(import.meta.url)('../package.json')

const TARGETS = {
  claude: { label: 'Claude Code', dir: '.claude', install: installClaude, uninstall: uninstallClaude },
  codex: { label: 'Codex', dir: '.codex', install: installCodex, uninstall: uninstallCodex }
}

const HELP = `
  ${style.bold('agentspec-rdd')} ${style.dim(`v${version}`)}
  Installs the AgentSpec SDD workflow into a project.

  ${style.bold('Usage')}
    npx agentspec-rdd [target] [options]

  ${style.bold('Targets')}
    --claude          Install for Claude Code, into .claude/
    --codex           Install for Codex, into .codex/ plus AGENTS.md
    --both            Install both
                      Targets also work as positional words: agentspec-rdd claude

  ${style.bold('Options')}
    --uninstall       Remove a previous install (see below)
    --dir <path>      Project directory (default: current directory)
    --force           Overwrite existing files; on uninstall, also remove edited ones
    --dry-run         Report what would change, change nothing
    -h, --help        Show this help
    -v, --version     Show version

  ${style.bold('Uninstall')}
    Only files recorded in the install manifest are removed, and only while their
    contents still match what was installed. Your work under sdd/features/, agents
    you added by hand, and files you edited are kept. Use --force to remove edited
    files too. On Codex, only the managed block of AGENTS.md is stripped.

  ${style.bold('Examples')}
    npx agentspec-rdd --claude
    npx agentspec-rdd --codex --dir ../my-project
    npx agentspec-rdd --both --dry-run
    npx agentspec-rdd --uninstall --claude
    npx agentspec-rdd --uninstall --both --dry-run
`

export function parseArgs (argv) {
  const options = {
    targets: [],
    dir: process.cwd(),
    force: false,
    dryRun: false,
    uninstall: false,
    help: false,
    version: false
  }

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]

    switch (arg) {
      case '--claude':
      case 'claude':
        options.targets.push('claude')
        break
      case '--codex':
      case 'codex':
        options.targets.push('codex')
        break
      case '--both':
      case 'both':
        options.targets.push('claude', 'codex')
        break
      case '--dir':
        if (!argv[index + 1]) throw new Error('--dir requires a path')
        options.dir = resolve(argv[++index])
        break
      case '--uninstall':
      case 'uninstall':
        options.uninstall = true
        break
      case '--force':
        options.force = true
        break
      case '--dry-run':
        options.dryRun = true
        break
      case '-h':
      case '--help':
        options.help = true
        break
      case '-v':
      case '--version':
        options.version = true
        break
      default:
        throw new Error(`unknown argument: ${arg}\nRun with --help to see the available options.`)
    }
  }

  options.targets = [...new Set(options.targets)]
  return options
}

async function promptForTarget () {
  if (!process.stdin.isTTY) {
    throw new Error('no target given. Pass --claude, --codex, or --both.')
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })

  try {
    console.log(`\n  ${style.bold('Which assistant is this project for?')}\n`)
    console.log(`    ${style.cyan('1')}  Claude Code  ${style.dim('-> .claude/')}`)
    console.log(`    ${style.cyan('2')}  Codex        ${style.dim('-> .codex/ + AGENTS.md')}`)
    console.log(`    ${style.cyan('3')}  Both\n`)

    const answer = (await rl.question('  Choice [1]: ')).trim() || '1'
    const choice = { 1: ['claude'], 2: ['codex'], 3: ['claude', 'codex'] }[answer]

    if (!choice) throw new Error(`invalid choice: ${answer}`)
    return choice
  } finally {
    rl.close()
  }
}

async function resolvePayload () {
  const base = join(packageRoot, '.base')

  const payload = {
    sdd: join(base, 'sdd'),
    // Every command group except visual-explainer, whose commands depend on a
    // skill this distribution does not carry and would fail when invoked.
    commands: ['workflow', 'knowledge', 'data-engineering', 'core', 'review']
      .map((group) => join(base, 'commands', group)),
    agents: join(base, 'agents'),
    kb: join(base, 'kb')
  }

  for (const [name, entry] of Object.entries(payload)) {
    for (const path of [entry].flat()) {
      if (!(await pathExists(path))) {
        throw new Error(`payload is incomplete: missing ${name} at ${path}`)
      }
    }
  }

  return payload
}

function summarise (targetLabel, result, report, options) {
  const verb = options.dryRun ? 'would write' : 'wrote'

  console.log(`\n  ${style.green('*')} ${style.bold(targetLabel)} ${style.dim(`-> ${result.root}`)}`)
  console.log(`    ${verb} ${report.created.length} new file(s), updated ${report.updated.length}`)

  if (report.skipped.length) {
    console.log(`    ${style.yellow(`skipped ${report.skipped.length} existing file(s)`)} ${style.dim('(use --force to overwrite)')}`)
  }

  console.log(`    ${style.dim(result.note)}`)
}

function summariseUninstall (targetLabel, result, options) {
  const { removed, kept, missing } = result.outcome
  const verb = options.dryRun ? 'would remove' : 'removed'

  console.log(`\n  ${style.green('*')} ${style.bold(targetLabel)} ${style.dim(`-> ${result.root}`)}`)
  console.log(`    ${verb} ${removed.length} file(s)`)

  if (kept.length) {
    console.log(`    ${style.yellow(`kept ${kept.length} edited file(s)`)} ${style.dim('(use --force to remove them too)')}`)
    for (const file of kept.slice(0, 5)) console.log(`      ${style.dim(file)}`)
    if (kept.length > 5) console.log(`      ${style.dim(`... and ${kept.length - 5} more`)}`)
  }

  if (missing.length) {
    console.log(`    ${style.dim(`${missing.length} file(s) were already gone`)}`)
  }

  if (result.pruned.length) {
    console.log(`    ${style.dim(`pruned ${result.pruned.length} empty director(ies)`)}`)
  }
}

async function runUninstall (options) {
  for (const key of options.targets) {
    const target = TARGETS[key]
    summariseUninstall(target.label, await target.uninstall(options), options)
  }

  console.log(`\n  ${style.dim('Your work under sdd/features/ and sdd/reports/ was left in place.')}\n`)
}

export async function main (argv) {
  const options = parseArgs(argv)

  if (options.help) {
    console.log(HELP)
    return
  }

  if (options.version) {
    console.log(version)
    return
  }

  if (!options.targets.length) {
    if (options.uninstall) {
      throw new Error('--uninstall needs a target. Pass --claude, --codex, or --both.')
    }
    options.targets = await promptForTarget()
  }

  if (options.dryRun) {
    console.log(`\n  ${style.yellow('dry run')} ${style.dim('- nothing will be changed')}`)
  }

  if (options.uninstall) {
    return runUninstall(options)
  }

  const payload = await resolvePayload()

  for (const key of options.targets) {
    const target = TARGETS[key]
    const report = createReport()
    const result = await target.install(payload, options, report)

    await writeManifest(result.root, key, version, report, options)
    summarise(target.label, result, report, options)
  }

  const docs = options.targets.map((key) => `${TARGETS[key].dir}/sdd/README.md`).join('  ')
  console.log(`\n  ${style.dim(`Docs: ${docs}`)}\n`)
}
