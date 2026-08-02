# agentspec-rdd

> Installs the **AgentSpec SDD workflow** — 5-phase spec-driven development — into a project, for **Claude Code** or **Codex**.

```bash
npx github:ip2cloud/agentspec-sdd --claude    # -> .claude/
npx github:ip2cloud/agentspec-sdd --codex     # -> .codex/ + AGENTS.md
```

Running it with no target asks which assistant the project uses.

Once the package is published to npm, the shorter form works from anywhere:

```bash
npx agentspec-rdd --claude
```

---

## What it installs

The **SDD core**: the 5-phase workflow and nothing else. No KB domains, no data engineering agent fleet.

| Component | Contents |
|-----------|----------|
| `sdd/` | Templates, `WORKFLOW_CONTRACTS.yaml`, `ARCHITECTURE.md`, working directories |
| Phase commands | `brainstorm`, `define`, `design`, `build`, `ship`, `iterate`, `create-pr` |
| Phase agents | `brainstorm-agent`, `define-agent`, `design-agent`, `build-agent`, `ship-agent`, `iterate-agent` |

```text
BRAINSTORM (0) -> DEFINE (1) -> DESIGN (2) -> BUILD (3) -> SHIP (4)
   optional        clarity       file           code +      archive +
                   >= 12/15      manifest       report      lessons
```

---

## Target layouts

The two assistants have different formats, so the Codex install is a **conversion**, not a copy.

### `--claude`

```text
.claude/
├── sdd/                     templates, contracts, features/, reports/, archive/
├── commands/workflow/       7 slash commands
└── agents/workflow/         6 subagents (invoked via the Task tool)
```

### `--codex`

```text
.codex/
├── sdd/                     same documents, paths rewritten to .codex/
├── prompts/                 7 native slash commands
└── skills/<name>/SKILL.md   6 skills converted from the subagents
AGENTS.md                    managed section pointing at all of the above
```

Conversion rules:

| From (Claude Code) | To (Codex) | Note |
|--------------------|-----------|------|
| `commands/workflow/define.md` | `prompts/define.md` | Codex takes the slash name from the filename |
| `agents/workflow/define-agent.md` | `skills/define-agent/SKILL.md` | `tier`, `model`, `tools` are preserved as a visible table rather than dropped |
| `.claude/...` references | `.codex/...` | Rewritten throughout the copied documents |
| Task-tool delegation | inline instruction | Codex has no Task tool; each skill says to follow it inline |

**`AGENTS.md` is never overwritten.** The generated content lives between
`<!-- agentspec-rdd:start -->` and `<!-- agentspec-rdd:end -->` markers; anything you
write outside them survives re-runs, and re-running only refreshes the managed block.

---

## Options

| Flag | Effect |
|------|--------|
| `--claude` | Install for Claude Code |
| `--codex` | Install for Codex |
| `--both` | Install both |
| `--dir <path>` | Target project directory (default: current directory) |
| `--force` | Overwrite files that already exist |
| `--dry-run` | Report what would be written, change nothing |
| `-h, --help` | Show help |
| `-v, --version` | Show version |

Targets also work as positional words: `npx github:ip2cloud/agentspec-sdd codex`.

Existing files are **skipped**, not overwritten, unless `--force` is passed. The summary
always reports how many files were created, updated, and skipped.

---

## After installing

```bash
/brainstorm "an incremental orders pipeline with SCD Type 2"   # optional, Phase 0
/define <brainstorm doc, notes, or a plain description>        # Phase 1, gate: Clarity Score >= 12/15
/design <DEFINE doc>                                           # Phase 2, produces the file manifest
/build <DESIGN doc>                                            # Phase 3, produces code + BUILD_REPORT
/ship <DEFINE doc>                                             # Phase 4, archives with lessons learned
```

Mid-stream changes go through `/iterate`, which updates the phase document and flags
what cascades downstream — not by editing code directly.

The machine-readable contract for every phase (required sections, quality gates, status
transitions) is `sdd/architecture/WORKFLOW_CONTRACTS.yaml`. It is the source of truth.

---

## Scope note

The installed `sdd/README.md` documents the **full** AgentSpec distribution: 42 specialized
agents across 7 categories and 18 knowledge base domains. This installer ships the workflow
core only, so the copied documents carry a banner saying so. Until you add agents of your own,
DESIGN assigns `(direct)` instead of a specialist, and KB domains named in a DEFINE Technical
Context resolve to nothing.

---

## Development

```bash
git clone git@github.com:ip2cloud/agentspec-sdd.git
cd agentspec-sdd
npm test        # payload verification + installer smoke tests
```

To try a local checkout against another project without publishing anything:

```bash
npx /path/to/agentspec-sdd --claude --dir ~/some-project
```

The payload is the repository's own `.claude/sdd`, `.claude/commands/workflow`, and
`.claude/agents/workflow` — there is no build step and no duplicated copy to keep in sync.

## License

MIT
