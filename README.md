# agentspec-rdd

> Instala o **workflow SDD do AgentSpec** — desenvolvimento orientado a especificação em 5 fases — em um projeto, para **Claude Code** ou **Codex**.

```bash
npx github:ip2cloud/agentspec-sdd --claude    # -> .claude/
npx github:ip2cloud/agentspec-sdd --codex     # -> .codex/ + AGENTS.md
```

Rodando sem alvo, ele pergunta qual assistente o projeto usa.

Depois que o pacote for publicado no npm, a forma curta funciona de qualquer lugar:

```bash
npx agentspec-rdd --claude
```

---

## O que ele instala

O **núcleo SDD**: o workflow de 5 fases e nada além disso. Sem domínios de KB, sem a frota de agentes de data engineering.

| Componente | Conteúdo |
|------------|----------|
| `sdd/` | Templates, `WORKFLOW_CONTRACTS.yaml`, `ARCHITECTURE.md`, diretórios de trabalho |
| Comandos de fase | `brainstorm`, `define`, `design`, `build`, `ship`, `iterate`, `create-pr` |
| Agentes de fase | `brainstorm-agent`, `define-agent`, `design-agent`, `build-agent`, `ship-agent`, `iterate-agent` |

```text
BRAINSTORM (0) -> DEFINE (1) -> DESIGN (2) -> BUILD (3) -> SHIP (4)
   (explorar)     (o quê)       (como)        (fazer)      (fechar)
   opcional       clareza       manifesto     código +     arquivo +
                  >= 12/15      de arquivos   relatório    lições
```

---

## Estrutura em cada alvo

Os dois assistentes têm formatos diferentes, então a instalação no Codex é uma **conversão**, não uma cópia.

### `--claude`

```text
.claude/
├── sdd/                     templates, contratos, features/, reports/, archive/
├── commands/workflow/       7 slash commands
└── agents/workflow/         6 subagentes (invocados pela ferramenta Task)
```

### `--codex`

```text
.codex/
├── sdd/                     mesmos documentos, caminhos reescritos para .codex/
├── prompts/                 7 slash commands nativos
└── skills/<nome>/SKILL.md   6 skills convertidas dos subagentes
AGENTS.md                    seção gerenciada apontando para tudo acima
```

Regras de conversão:

| De (Claude Code) | Para (Codex) | Observação |
|------------------|--------------|------------|
| `commands/workflow/define.md` | `prompts/define.md` | O Codex tira o nome do slash do nome do arquivo |
| `agents/workflow/define-agent.md` | `skills/define-agent/SKILL.md` | `tier`, `model` e `tools` viram tabela visível em vez de serem descartados |
| Referências a `.claude/...` | `.codex/...` | Reescritas em todos os documentos copiados |
| Delegação via ferramenta Task | Instrução inline | O Codex não tem Task; cada skill orienta a seguir as instruções inline |

**O `AGENTS.md` nunca é sobrescrito.** O conteúdo gerado fica entre os marcadores
`<!-- agentspec-rdd:start -->` e `<!-- agentspec-rdd:end -->`; tudo que você escrever
fora deles sobrevive às reexecuções, e rodar de novo apenas atualiza o bloco gerenciado.

---

## Opções

| Flag | Efeito |
|------|--------|
| `--claude` | Instala para o Claude Code |
| `--codex` | Instala para o Codex |
| `--both` | Instala os dois |
| `--dir <caminho>` | Diretório do projeto de destino (padrão: diretório atual) |
| `--force` | Sobrescreve arquivos que já existem |
| `--dry-run` | Mostra o que seria escrito, sem alterar nada |
| `-h, --help` | Mostra a ajuda |
| `-v, --version` | Mostra a versão |

Os alvos também funcionam como palavra posicional: `npx github:ip2cloud/agentspec-sdd codex`.

Arquivos existentes são **pulados**, não sobrescritos, a menos que você passe `--force`.
O resumo sempre informa quantos arquivos foram criados, atualizados e pulados.

---

## Depois de instalar

```bash
/brainstorm "pipeline incremental de pedidos com SCD Tipo 2"   # opcional, Fase 0
/define <doc de brainstorm, anotações ou uma descrição direta> # Fase 1, gate: Clarity Score >= 12/15
/design <doc DEFINE>                                           # Fase 2, produz o manifesto de arquivos
/build <doc DESIGN>                                            # Fase 3, produz código + BUILD_REPORT
/ship <doc DEFINE>                                             # Fase 4, arquiva com lições aprendidas
```

Mudanças no meio do caminho passam pelo `/iterate`, que atualiza o documento da fase e
sinaliza o que cascateia para as fases seguintes — não editando o código direto.

O contrato legível por máquina de cada fase (seções obrigatórias, quality gates, transições
de status) é o `sdd/architecture/WORKFLOW_CONTRACTS.yaml`. Ele é a fonte da verdade.

---

## Observação de escopo

O `sdd/README.md` instalado documenta a distribuição **completa** do AgentSpec: 42 agentes
especializados em 7 categorias e 18 domínios de knowledge base. Este instalador entrega
apenas o núcleo do workflow, então os documentos copiados levam um aviso dizendo isso.
Enquanto você não adicionar agentes próprios, o DESIGN vai atribuir `(direct)` no lugar de
um especialista, e os domínios de KB citados no Technical Context de um DEFINE não vão
resolver para nada.

---

## Desenvolvimento

```bash
git clone git@github.com:ip2cloud/agentspec-sdd.git
cd agentspec-sdd
npm test        # verificação do payload + testes de fumaça do instalador
```

Para testar um checkout local contra outro projeto, sem publicar nada:

```bash
npx /caminho/para/agentspec-sdd --claude --dir ~/algum-projeto
```

O payload é o próprio `.claude/sdd`, `.claude/commands/workflow` e `.claude/agents/workflow`
do repositório — não há etapa de build nem cópia duplicada para manter em sincronia.

## Licença

MIT
