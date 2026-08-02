import { rewriteForCodex } from './util.js'

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/**
 * Splits a Claude Code markdown asset into its YAML frontmatter and body.
 * Only the subset of YAML that AgentSpec assets actually use is interpreted:
 * scalar values, `|` block scalars, and inline `[a, b]` lists.
 */
export function parseAsset (text) {
  const match = text.match(FRONTMATTER)

  if (!match) {
    return { attrs: {}, frontmatter: '', body: text.trim() }
  }

  return {
    attrs: parseSimpleYaml(match[1]),
    frontmatter: match[1],
    body: text.slice(match[0].length).trim()
  }
}

function parseSimpleYaml (yaml) {
  const attrs = {}
  const lines = yaml.split(/\r?\n/)

  for (let index = 0; index < lines.length; index++) {
    const entry = lines[index].match(/^([a-zA-Z_][\w-]*):\s*(.*)$/)
    if (!entry) continue

    const [, key, rawValue] = entry

    if (rawValue === '|' || rawValue === '|-' || rawValue === '>') {
      const block = []
      while (index + 1 < lines.length && /^(\s{2,}|\s*$)/.test(lines[index + 1])) {
        block.push(lines[++index].replace(/^ {2}/, ''))
      }
      attrs[key] = block.join('\n').trim()
      continue
    }

    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      attrs[key] = rawValue
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
      continue
    }

    if (rawValue !== '') {
      attrs[key] = rawValue.replace(/^["']|["']$/g, '')
    }
  }

  return attrs
}

const yamlBlock = (key, value) =>
  value.includes('\n')
    ? `${key}: |\n${value.split('\n').map((line) => (line.trim() ? `  ${line}` : '')).join('\n')}`
    : `${key}: ${JSON.stringify(value)}`

/** Splits a leading `# Heading` off a markdown body so it can be reused as the title. */
function splitHeading (body) {
  const lines = body.split('\n')
  const match = lines[0]?.match(/^#\s+(.*)$/)

  return match
    ? { title: match[1].trim(), rest: lines.slice(1).join('\n').trim() }
    : { title: null, rest: body }
}

/**
 * Claude slash command -> Codex custom prompt. Codex resolves the slash name from
 * the filename, so only `description` and `argument-hint` survive in frontmatter.
 */
export function toCodexPrompt (asset, sourceName) {
  const { attrs, body } = parseAsset(asset)
  const name = attrs.name ?? sourceName

  if (!name) {
    throw new Error(`command asset has no resolvable name (source: ${sourceName})`)
  }

  const frontmatter = [
    '---',
    yamlBlock('description', attrs.description ?? `AgentSpec ${name} phase`),
    '---'
  ].join('\n')

  return {
    name,
    content: `${frontmatter}\n\n${rewriteForCodex(body)}\n`
  }
}

const AGENT_METADATA_KEYS = [
  ['tier', 'Tier'],
  ['model', 'Model'],
  ['tools', 'Tools'],
  ['kb_domains', 'KB domains']
]

/**
 * Claude subagent -> Codex skill. Codex skills carry only name + description in
 * frontmatter, so the remaining Claude metadata is preserved as a visible table
 * rather than silently dropped.
 */
export function toCodexSkill (asset, sourceName) {
  const { attrs, body } = parseAsset(asset)
  const name = attrs.name ?? sourceName

  if (!name) {
    throw new Error(`agent asset has no resolvable name (source: ${sourceName})`)
  }

  const description = attrs.description ?? `AgentSpec ${name}`
  const frontmatter = ['---', `name: ${name}`, yamlBlock('description', description), '---'].join('\n')

  const metadata = AGENT_METADATA_KEYS
    .filter(([key]) => attrs[key] !== undefined && attrs[key].length > 0)
    .map(([key, label]) => {
      const value = Array.isArray(attrs[key]) ? attrs[key].join(', ') : attrs[key]
      return `| **${label}** | ${value} |`
    })

  const { title, rest } = splitHeading(body)

  const metadataTable = metadata.length
    ? ['## Origin Metadata', '', '| Attribute | Value |', '|-----------|-------|', ...metadata].join('\n')
    : ''

  const preamble = [
    `# ${title ?? name}`,
    '',
    '> Converted from a Claude Code subagent by `agentspec-rdd`. Codex has no Task',
    '> tool: when the SDD workflow says to delegate to this agent, follow these',
    '> instructions inline instead of spawning a separate agent.'
  ]

  if (metadataTable) preamble.push('', metadataTable)

  return {
    name,
    content: `${frontmatter}\n\n${preamble.join('\n')}\n\n${rewriteForCodex(rest)}\n`
  }
}

const PROFILE_DOCS = new Set(['README.md', '_index.md'])

/**
 * The bundled SDD docs describe the full AgentSpec distribution. This installer
 * ships only the workflow core, so the copied docs get a banner saying which
 * parts are actually present — otherwise they promise agents and KB domains that
 * the project does not have.
 */
export function decorateSddDoc (content, file, targetDir) {
  if (!PROFILE_DOCS.has(file)) return content

  const notice = [
    '> **Installed profile: workflow + agents.** `agentspec-rdd` installed the 5-phase',
    `> workflow (\`${targetDir}/sdd/\`), the 7 phase commands, and all 42 agents.`,
    '>',
    '> The 18 KB domains described below are **not** part of this install. Agent Matching',
    '> works, but KB-First resolution has nothing local to read: domains named in a DEFINE',
    '> Technical Context resolve to nothing, and agents fall back to their own knowledge.',
    `> To close that gap, add the domains under \`${targetDir}/kb/\`.`,
    ''
  ].join('\n')

  const lines = content.split('\n')
  const headingIndex = lines.findIndex((line) => line.startsWith('# '))

  if (headingIndex === -1) return `${notice}\n${content}`

  const head = lines.slice(0, headingIndex + 1)
  const tail = lines.slice(headingIndex + 1)

  return [...head, '', notice, ...tail].join('\n')
}

const AGENTS_MD_START = '<!-- agentspec-rdd:start -->'
const AGENTS_MD_END = '<!-- agentspec-rdd:end -->'

export function buildAgentsSection (commands, agents) {
  const commandRows = commands
    .map((command) => `| \`/${command.name}\` | ${firstLine(command.description)} |`)
    .join('\n')

  const phaseAgents = agents.filter((agent) => agent.category === 'workflow')
  const specialists = agents.filter((agent) => agent.category !== 'workflow')

  const agentRows = phaseAgents
    .map((agent) => `| \`${agent.name}\` | \`.codex/skills/${agent.name}/SKILL.md\` |`)
    .join('\n')

  const byCategory = new Map()
  for (const agent of specialists) {
    byCategory.set(agent.category, [...(byCategory.get(agent.category) ?? []), agent.name])
  }

  const specialistRows = [...byCategory.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([category, names]) =>
      `| **${category}** | ${names.length} | ${names.map((name) => `\`${name}\``).join(', ')} |`)
    .join('\n')

  return [
    AGENTS_MD_START,
    '',
    '## AgentSpec SDD Workflow',
    '',
    'This project uses AgentSpec: a 5-phase spec-driven workflow where each phase',
    'produces a document that is the input to the next one.',
    '',
    '```text',
    'BRAINSTORM (0) -> DEFINE (1) -> DESIGN (2) -> BUILD (3) -> SHIP (4)',
    '   optional        clarity        file          code +      archive +',
    '                   >= 12/15       manifest      report      lessons',
    '```',
    '',
    '### Phase prompts',
    '',
    'Invoke these as slash commands; each one is a file under `.codex/prompts/`.',
    '',
    '| Prompt | Purpose |',
    '|--------|---------|',
    commandRows,
    '',
    '### Phase skills',
    '',
    'Each phase has a matching skill holding the detailed procedure. There is no Task',
    'tool in Codex, so read the relevant skill and follow it inline.',
    '',
    '| Skill | Location |',
    '|-------|----------|',
    agentRows,
    '',
    '### Specialist skills',
    '',
    `${specialists.length} domain specialists live under \`.codex/skills/\`. DESIGN assigns one to each`,
    'file in the manifest; BUILD then reads that skill and follows it while writing the file.',
    '',
    '| Category | Count | Skills |',
    '|----------|------:|--------|',
    specialistRows,
    '',
    '### Where artifacts live',
    '',
    '| Artifact | Path |',
    '|----------|------|',
    '| `BRAINSTORM_{FEATURE}.md` | `.codex/sdd/features/` |',
    '| `DEFINE_{FEATURE}.md` | `.codex/sdd/features/` |',
    '| `DESIGN_{FEATURE}.md` | `.codex/sdd/features/` |',
    '| `BUILD_REPORT_{FEATURE}.md` | `.codex/sdd/reports/` |',
    '| `SHIPPED_{DATE}.md` | `.codex/sdd/archive/{FEATURE}/` |',
    '',
    'Templates are in `.codex/sdd/templates/`. The machine-readable contract for every',
    'phase — required sections, quality gates, status transitions — is',
    '`.codex/sdd/architecture/WORKFLOW_CONTRACTS.yaml`. Read it before running a phase.',
    '',
    '### Rules',
    '',
    '- Do not skip DEFINE. A Clarity Score below 12/15 means requirements are not ready.',
    '- Mid-stream changes go through `/iterate`, not by editing code directly.',
    '- Every file in a DESIGN file manifest must name an owner before BUILD starts.',
    '',
    AGENTS_MD_END
  ].join('\n')
}

const firstLine = (text = '') => text.split('\n')[0].trim()

/**
 * Injects the managed section into an existing AGENTS.md without touching any
 * content the user wrote around it.
 */
export function mergeAgentsMd (existing, section) {
  if (!existing) {
    return `# AGENTS.md\n\n${section}\n`
  }

  const start = existing.indexOf(AGENTS_MD_START)
  const end = existing.indexOf(AGENTS_MD_END)

  if (start !== -1 && end !== -1) {
    return existing.slice(0, start) + section + existing.slice(end + AGENTS_MD_END.length)
  }

  return `${existing.trimEnd()}\n\n${section}\n`
}
