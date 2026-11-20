import { rewritePaths } from './util.js'
import { resolveClass, resolveModelPlaceholders } from './models.js'

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
 * the filename, so only `description` survives in frontmatter. Codex prompts
 * cannot pin a model, so a command that declares a model class is told to hand
 * the phase to its custom agent, which does carry the model.
 */
export function toCodexPrompt (asset, sourceName, models) {
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

  const where = `commands/${sourceName}.md`
  let content = resolveModelPlaceholders(rewritePaths(body, 'codex'), 'codex', models, where)

  if (attrs.model) {
    const model = resolveClass(models, 'codex', attrs.model, where)
    const agent = body.match(/\.base\/agents\/workflow\/([\w-]+)\.md/)?.[1]

    const note = agent
      ? `> **Model:** this phase runs on ${model.label} (\`${model.model}\`, reasoning \`${model.reasoning_effort ?? 'default'}\`).\n` +
        `> Delegate it to the \`${agent}\` custom agent (\`.codex/agents/${agent}.toml\`), which is pinned\n` +
        '> to that model, and wait for its result before reporting back.'
      : `> **Model:** this command is meant to run on ${model.label} (\`${model.model}\`).`

    const { title, rest } = splitHeading(content)
    content = title ? `# ${title}\n\n${note}\n\n${rest}` : `${note}\n\n${content}`
  }

  return { name, model: attrs.model ?? null, content: `${frontmatter}\n\n${content}\n` }
}

const AGENT_METADATA_KEYS = [
  ['tier', 'Tier'],
  ['tools', 'Tools'],
  ['kb_domains', 'KB domains']
]

/** TOML multi-line string. Literal form needs no escaping; fall back to basic form if the text contains its delimiter. */
function tomlMultiline (text) {
  if (!text.includes("'''")) return `'''\n${text}\n'''`
  const escaped = text.replace(/\\/g, '\\\\').replace(/"""/g, '""\\"')
  return `"""\n${escaped}\n"""`
}

/**
 * Claude subagent -> Codex custom agent (.codex/agents/<name>.toml). The model
 * class is resolved to a Codex model and reasoning effort from MODELS.yaml, so the
 * agent runs on the model the architecture assigns it. Claude-only metadata with
 * no Codex field is kept as a visible table in the instructions.
 */
export function toCodexAgent (asset, sourceName, models) {
  const { attrs, body } = parseAsset(asset)
  const name = attrs.name ?? sourceName
  const where = `agents/${sourceName}.md`

  if (!name) {
    throw new Error(`agent asset has no resolvable name (source: ${sourceName})`)
  }

  if (!attrs.model) {
    throw new Error(`agent ${where} declares no model class`)
  }

  const model = resolveClass(models, 'codex', attrs.model, where)
  const description = attrs.description ?? `AgentSpec ${name}`

  const metadata = AGENT_METADATA_KEYS
    .filter(([key]) => attrs[key] !== undefined && attrs[key].length > 0)
    .map(([key, label]) => {
      const value = Array.isArray(attrs[key]) ? attrs[key].join(', ') : attrs[key]
      return `| **${label}** | ${value} |`
    })

  const { title, rest } = splitHeading(body)

  const preamble = [
    `# ${title ?? name}`,
    '',
    '> Converted from a Claude Code subagent by `agentspec-sdd`. Model class',
    `> \`${attrs.model}\` resolves to ${model.label} (\`${model.model}\`) in Codex.`
  ]

  if (metadata.length) {
    preamble.push('', '## Origin Metadata', '', '| Attribute | Value |', '|-----------|-------|', ...metadata)
  }

  const instructions = resolveModelPlaceholders(
    `${preamble.join('\n')}\n\n${rewritePaths(rest, 'codex')}`.replace(/\r\n/g, '\n'),
    'codex', models, where)

  const lines = [
    `name = ${JSON.stringify(name)}`,
    `description = ${JSON.stringify(description)}`,
    `model = ${JSON.stringify(model.model)}`
  ]

  if (model.reasoning_effort) {
    lines.push(`model_reasoning_effort = ${JSON.stringify(model.reasoning_effort)}`)
  }

  lines.push(`developer_instructions = ${tomlMultiline(instructions)}`)

  return { name, modelClass: attrs.model, content: `${lines.join('\n')}\n` }
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
    '> **Installed by `agentspec-sdd`.** This project has the 5-phase workflow',
    `> (\`${targetDir}/sdd/\`), all 42 agents, and all 18 KB domains.`,
    '>',
    '> 21 of the 29 commands documented below ship. The 8 visual explainer commands are',
    '> excluded: they depend on a skill this distribution does not carry.',
    ''
  ].join('\n')

  const lines = content.split('\n')
  const headingIndex = lines.findIndex((line) => line.startsWith('# '))

  if (headingIndex === -1) return `${notice}\n${content}`

  const head = lines.slice(0, headingIndex + 1)
  const tail = lines.slice(headingIndex + 1)

  return [...head, '', notice, ...tail].join('\n')
}

export function buildAgentsDoc (commands, agents, models) {
  const modelOf = (modelClass) => resolveClass(models, 'codex', modelClass)

  const commandRows = commands
    .map((command) => {
      const model = command.model ? modelOf(command.model).label : 'session model'
      return `| \`/${command.name}\` | ${model} | ${firstLine(command.description)} |`
    })
    .join('\n')

  const phaseAgents = agents.filter((agent) => agent.category === 'workflow')
  const specialists = agents.filter((agent) => agent.category !== 'workflow')

  const agentRows = phaseAgents
    .map((agent) => {
      const model = modelOf(agent.modelClass)
      return `| \`${agent.name}\` | ${model.label} (\`${model.model}\`) | \`.codex/agents/${agent.name}.toml\` |`
    })
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

  const classRows = Object.entries(models.classes)
    .map(([name, entry]) => {
      const count = agents.filter((agent) => agent.modelClass === name).length
      const effort = entry.codex.reasoning_effort ? `\`${entry.codex.reasoning_effort}\`` : 'default'
      return `| \`${name}\` | ${entry.codex.label} | \`${entry.codex.model}\` | ${effort} | ${count} |`
    })
    .join('\n')

  return [
    '# AgentSpec SDD Workflow',
    '',
    '> Generated by `agentspec-sdd`. This file describes the workflow installed under',
    '> `.codex/`. It is self-contained: nothing outside `.codex/` was created or modified.',
    '',
    'A 5-phase spec-driven workflow where each phase produces a document that is the',
    'input to the next one.',
    '',
    '```text',
    'BRAINSTORM (0) -> DEFINE (1) -> DESIGN (2) -> BUILD (3) -> SHIP (4)',
    '   optional        clarity        file          code +      archive +',
    '                   >= 12/15       manifest      report      lessons',
    '```',
    '',
    '### Phase prompts',
    '',
    'Invoke these as slash commands; each one is a file under `.codex/prompts/`. A prompt',
    'cannot pin a model, so each phase prompt hands the work to its phase agent, which does.',
    '',
    '| Prompt | Model | Purpose |',
    '|--------|-------|---------|',
    commandRows,
    '',
    '### Phase agents',
    '',
    'Each phase has a project-scoped custom agent holding the detailed procedure, pinned to',
    'the model the architecture assigns that phase. Spawn it to run the phase.',
    '',
    '| Agent | Model | File |',
    '|-------|-------|------|',
    agentRows,
    '',
    '### Specialist agents',
    '',
    `${specialists.length} domain specialists live under \`.codex/agents/\`. DESIGN assigns one to each`,
    'file in the manifest; BUILD then delegates that file to the matching agent.',
    '',
    '| Category | Count | Agents |',
    '|----------|------:|--------|',
    specialistRows,
    '',
    '### Models',
    '',
    'Phases and agents declare a model class, not a model. For Codex the classes resolve to:',
    '',
    '| Class | Model | Identifier | Reasoning effort | Agents |',
    '|-------|-------|------------|------------------|-------:|',
    classRows,
    '',
    'The mapping lives in `.codex/sdd/architecture/MODELS.yaml`. To change a model, edit the',
    'source `MODELS.yaml` in agentspec-sdd and reinstall with `--force`.',
    '',
    '### Knowledge base',
    '',
    'Every agent declares the KB domains it reads (`KB domains` in its Origin Metadata) and follows',
    '**KB-First resolution**: read the local domain before reaching for anything external.',
    '',
    '```text',
    '1. Read .codex/kb/{domain}/index.md      scan headings only',
    '2. Read the one pattern or concept file that matches the task',
    '3. Only then fall back to outside knowledge',
    '```',
    '',
    '`.codex/kb/` ships with 18 domains, registered in `.codex/kb/_index.yaml`. A DEFINE names',
    'the domains it needs in its Technical Context, and DESIGN and BUILD pull patterns from',
    'exactly those. Run `/create-kb` to add a domain of your own.',
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
    ''
  ].join('\n')
}

const firstLine = (text = '') => text.split('\n')[0].trim()

