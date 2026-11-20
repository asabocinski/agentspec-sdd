import { readText } from './util.js'

/**
 * Model classes are the assistant-neutral way the payload names a model. The
 * mapping from class to concrete model lives in sdd/architecture/MODELS.yaml;
 * this module loads it and resolves classes for one install target.
 */

const PLACEHOLDER = /\{\{model(-id)?:([a-z][\w-]*)\}\}/g

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/
const FRONTMATTER_MODEL = /^(model:[ \t]*)([A-Za-z][\w.-]*)/m

/**
 * Parses the indentation-nested YAML subset MODELS.yaml uses: maps of maps and
 * scalar values, with comments. Anything richer is rejected rather than misread.
 */
export function parseModelsYaml (text) {
  const root = {}
  const stack = [{ indent: -1, node: root }]

  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.replace(/\s+#.*$/, '').replace(/^\s*#.*$/, '')
    if (!line.trim()) continue

    const match = line.match(/^(\s*)([A-Za-z_][\w-]*):\s*(.*)$/)
    if (!match) throw new Error(`MODELS.yaml line ${index + 1}: cannot parse "${raw.trim()}"`)

    const [, spaces, key, value] = match
    const indent = spaces.length

    while (stack.at(-1).indent >= indent) stack.pop()
    const parent = stack.at(-1).node

    if (value === '') {
      parent[key] = {}
      stack.push({ indent, node: parent[key] })
    } else {
      parent[key] = value.replace(/^(["'])(.*)\1$/, '$2')
    }
  }

  return root
}

export async function loadModels (path) {
  const models = parseModelsYaml(await readText(path))

  for (const [name, entry] of Object.entries(models.classes ?? {})) {
    for (const target of ['claude', 'codex']) {
      if (!entry?.[target]?.model || !entry[target].label) {
        throw new Error(`MODELS.yaml: class "${name}" has no ${target}.model / ${target}.label`)
      }
    }
  }

  if (!Object.keys(models.classes ?? {}).length) {
    throw new Error('MODELS.yaml defines no model classes')
  }

  return models
}

/** Looks a class up for a target, failing loudly on a class MODELS.yaml does not define. */
export function resolveClass (models, target, name, where = '') {
  const entry = models.classes[name]?.[target]

  if (!entry) {
    const known = Object.keys(models.classes).join(', ')
    throw new Error(`unknown model class "${name}"${where ? ` in ${where}` : ''} (known: ${known})`)
  }

  return entry
}

/** Replaces {{model:<class>}} with the display name and {{model-id:<class>}} with the identifier. */
export function resolveModelPlaceholders (text, target, models, where) {
  return text.replace(PLACEHOLDER, (_, id, name) => {
    const entry = resolveClass(models, target, name, where)
    return id ? entry.model : entry.label
  })
}

/** Reads the model class a frontmatter block declares, or null. */
export function modelClassOf (text) {
  const frontmatter = text.match(FRONTMATTER)?.[1]
  return frontmatter?.match(FRONTMATTER_MODEL)?.[2] ?? null
}

/**
 * Rewrites `model: <class>` inside a leading frontmatter block to the target's
 * concrete model. Bodies are left alone: only the frontmatter is configuration.
 */
export function resolveFrontmatterModel (text, target, models, where) {
  const match = text.match(FRONTMATTER)
  if (!match) return text

  const block = match[0].replace(FRONTMATTER_MODEL, (_, key, name) =>
    `${key}${resolveClass(models, target, name, where).model}`)

  return block + text.slice(match[0].length)
}
