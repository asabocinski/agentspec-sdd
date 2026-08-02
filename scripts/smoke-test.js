import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listFiles, pathExists } from '../src/util.js'
import { main } from '../src/cli.js'

const checks = []
const check = (name, condition) => checks.push({ name, ok: Boolean(condition) })

const sandbox = await mkdtemp(join(tmpdir(), 'agentspec-rdd-'))
const silence = console.log
console.log = () => {}

try {
  const claudeDir = join(sandbox, 'claude-project')
  await mkdir(claudeDir, { recursive: true })
  await main(['--claude', '--dir', claudeDir])

  check('claude: WORKFLOW_CONTRACTS copied',
    await pathExists(join(claudeDir, '.claude/sdd/architecture/WORKFLOW_CONTRACTS.yaml')))
  check('claude: 7 workflow commands',
    (await listFiles(join(claudeDir, '.claude/commands/workflow'))).length === 7)
  check('claude: 6 workflow agents',
    (await listFiles(join(claudeDir, '.claude/agents/workflow'))).length === 6)
  check('claude: all 42 agents across 7 categories',
    (await listFiles(join(claudeDir, '.claude/agents')))
      .filter((file) => file.includes('/') && !file.endsWith('_template.md')).length === 42)
  check('claude: agent categories preserved',
    await pathExists(join(claudeDir, '.claude/agents/data-engineering/dbt-specialist.md')))
  check('claude: working dirs created',
    await pathExists(join(claudeDir, '.claude/sdd/features')))

  const codexDir = join(sandbox, 'codex-project')
  await mkdir(codexDir, { recursive: true })
  await writeFile(join(codexDir, 'AGENTS.md'), '# My project\n\nHand-written rules.\n')
  await main(['--codex', '--dir', codexDir])

  const define = await readFile(join(codexDir, '.codex/prompts/define.md'), 'utf8')
  const skill = await readFile(join(codexDir, '.codex/skills/define-agent/SKILL.md'), 'utf8')
  const agentsMd = await readFile(join(codexDir, 'AGENTS.md'), 'utf8')
  const contracts = await readFile(join(codexDir, '.codex/sdd/architecture/WORKFLOW_CONTRACTS.yaml'), 'utf8')

  check('codex: prompts generated', (await listFiles(join(codexDir, '.codex/prompts'))).length === 7)
  check('codex: 42 skills generated', (await listFiles(join(codexDir, '.codex/skills'))).length === 42)
  check('codex: specialist skill converted',
    await pathExists(join(codexDir, '.codex/skills/dbt-specialist/SKILL.md')))
  check('codex: README/_template not turned into skills',
    !(await pathExists(join(codexDir, '.codex/skills/README/SKILL.md'))) &&
    !(await pathExists(join(codexDir, '.codex/skills/_template/SKILL.md'))))
  check('codex: prompt keeps description', define.includes('description:'))
  check('codex: skill declares name', skill.includes('name: define-agent'))
  const outsideFences = skill.replace(/```[\s\S]*?```/g, '')
  check('codex: skill has one H1', (outsideFences.match(/^# /gm) ?? []).length === 1)
  check('codex: skill blocks are separated', /\n# .+\n\n> Converted/.test(skill))
  check('codex: skill keeps origin metadata', skill.includes('| **Tier** |'))
  check('codex: paths rewritten in prompts', !define.includes('.claude/'))
  check('codex: paths rewritten in sdd', !contracts.includes('.claude/'))
  check('codex: AGENTS.md preserves user content', agentsMd.includes('Hand-written rules.'))
  check('codex: AGENTS.md has managed block', agentsMd.includes('<!-- agentspec-rdd:start -->'))
  check('codex: AGENTS.md lists specialist categories',
    agentsMd.includes('**data-engineering**') && agentsMd.includes('### Specialist skills'))

  await main(['--codex', '--dir', codexDir])
  const rerun = await readFile(join(codexDir, 'AGENTS.md'), 'utf8')
  check('codex: AGENTS.md merge is idempotent',
    rerun === agentsMd && rerun.split('<!-- agentspec-rdd:start -->').length === 2)

  const dryDir = join(sandbox, 'dry-project')
  await mkdir(dryDir, { recursive: true })
  await main(['--claude', '--dir', dryDir, '--dry-run'])
  check('dry run writes nothing', !(await pathExists(join(dryDir, '.claude'))))
} finally {
  console.log = silence
  await rm(sandbox, { recursive: true, force: true })
}

const failed = checks.filter((entry) => !entry.ok)

for (const entry of checks) {
  console.log(`  ${entry.ok ? 'ok  ' : 'FAIL'} ${entry.name}`)
}

if (failed.length) {
  console.error(`\n${failed.length} of ${checks.length} checks failed`)
  process.exit(1)
}

console.log(`\n${checks.length} checks passed`)
