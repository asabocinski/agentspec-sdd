import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { createRequire } from 'node:module'
import { createReport, pathExists, style } from './util.js'
import { installClaude, installCodex } from './targets.js'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = createRequire(import.meta.url)('../package.json')

const TARGETS = {
  claude: { label: 'Claude Code', dir: '.claude', install: installClaude },
  codex: { label: 'Codex', dir: '.codex', install: installCodex }
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
    --dir <path>      Project directory (default: current directory)
    --force           Overwrite files that already exist
    --dry-run         Report what would be written, change nothing
    -h, --help        Show this help
    -v, --version     Show version

  ${style.bold('Examples')}
    npx agentspec-rdd --claude
    npx agentspec-rdd --codex --dir ../my-project
    npx agentspec-rdd --both --dry-run
`

export function parseArgs (argv) {
  const options = { targets: [], dir: process.cwd(), force: false, dryRun: false, help: false, version: false }

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
  const payload = {
    sdd: join(packageRoot, '.claude', 'sdd'),
    commands: join(packageRoot, '.claude', 'commands', 'workflow'),
    agents: join(packageRoot, '.claude', 'agents', 'workflow')
  }

  for (const [name, path] of Object.entries(payload)) {
    if (!(await pathExists(path))) {
      throw new Error(`payload is incomplete: missing ${name} at ${path}`)
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
    options.targets = await promptForTarget()
  }

  const payload = await resolvePayload()

  if (options.dryRun) {
    console.log(`\n  ${style.yellow('dry run')} ${style.dim('- nothing will be written')}`)
  }

  for (const key of options.targets) {
    const target = TARGETS[key]
    const report = createReport()
    const result = await target.install(payload, options, report)

    summarise(target.label, result, report, options)
  }

  const docs = options.targets.map((key) => `${TARGETS[key].dir}/sdd/README.md`).join('  ')
  console.log(`\n  ${style.dim(`Docs: ${docs}`)}\n`)
}
