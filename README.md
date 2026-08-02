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

O workflow de 5 fases e **os 42 agentes**. O knowledge base **não** vem junto — ele é
específico do seu projeto, e a seção [Knowledge Base](#knowledge-base) explica por que isso
importa e como criar o seu.

| Componente | Conteúdo |
|------------|----------|
| `sdd/` | Templates, `WORKFLOW_CONTRACTS.yaml`, `ARCHITECTURE.md`, diretórios de trabalho |
| Comandos de fase | `brainstorm`, `define`, `design`, `build`, `ship`, `iterate`, `create-pr` |
| Agentes de fase | `brainstorm-agent`, `define-agent`, `design-agent`, `build-agent`, `ship-agent`, `iterate-agent` |
| Agentes especialistas | 36 agentes de domínio, com as categorias preservadas |

Os 42 agentes em 7 categorias:

| Categoria | Qtd | Foco |
|-----------|----:|------|
| `data-engineering` | 13 | dbt, Spark, Airflow, Lakeflow, SQL, Qdrant |
| `architect` | 8 | schema, pipeline, medallion, lakehouse, GenAI, plataforma, KB |
| `python` | 6 | código, review, limpeza, documentação, prompts, LLM |
| `workflow` | 6 | as 5 fases do SDD + iterate |
| `dev` | 4 | exploração de codebase, shell, reuniões, prompt-crafter |
| `test` | 3 | geração de testes, qualidade de dados, contratos |
| `cloud` | 2 | CI/CD, Supabase |

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
├── .agentspec-rdd.json      manifesto: o que foi instalado (usado na desinstalação)
├── sdd/                     templates, contratos, features/, reports/, archive/
├── commands/workflow/       7 slash commands
└── agents/                  42 subagentes (invocados pela ferramenta Task)
    ├── workflow/            6 agentes de fase
    ├── data-engineering/    13 especialistas
    ├── architect/           8 especialistas
    └── ...                  python, dev, test, cloud
```

### `--codex`

```text
.codex/
├── .agentspec-rdd.json      manifesto: o que foi instalado (usado na desinstalação)
├── sdd/                     mesmos documentos, caminhos reescritos para .codex/
├── prompts/                 7 slash commands nativos
└── skills/<nome>/SKILL.md   42 skills convertidas dos subagentes
AGENTS.md                    seção gerenciada apontando para tudo acima
```

No Codex as skills ficam todas planas em `.codex/skills/`, porque é assim que o Codex as
descobre. A categoria de origem não se perde: o `AGENTS.md` gerado agrupa os especialistas
por categoria numa tabela.

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
| `--uninstall` | Remove uma instalação anterior |
| `--dir <caminho>` | Diretório do projeto de destino (padrão: diretório atual) |
| `--force` | Sobrescreve arquivos existentes; na desinstalação, remove também os editados |
| `--dry-run` | Mostra o que mudaria, sem alterar nada |
| `-h, --help` | Mostra a ajuda |
| `-v, --version` | Mostra a versão |

Os alvos também funcionam como palavra posicional: `npx github:ip2cloud/agentspec-sdd codex`.

Arquivos existentes são **pulados**, não sobrescritos, a menos que você passe `--force`.
O resumo sempre informa quantos arquivos foram criados, atualizados e pulados.

---

## Knowledge Base

O KB **não vem no instalador**, e isso é proposital: os padrões que importam são os do
**seu** projeto, não os de outro. Mas os agentes foram construídos esperando que ele exista.
Vale entender o que muda com e sem ele.

### Por que importa

Todo agente declara no frontmatter quais domínios lê:

```yaml
kb_domains: [dbt, data-quality, sql-patterns]
```

E segue **resolução KB-First** — consultar o conhecimento local antes de qualquer fonte
externa. A ordem é fixa:

```text
1. Ler kb/{dominio}/index.md          só os títulos, ~20 linhas
2. Ler o arquivo de pattern ou concept que casa com a tarefa   um só, não todos
3. Só então recorrer a MCP ou ao conhecimento próprio do modelo
```

Sem KB, o passo 1 não acha nada e o agente responde com o que ele acha que sabe. Com KB, ele
responde com o padrão que **a sua equipe decidiu**. A diferença na prática:

| | Sem KB | Com KB |
|---|---|---|
| Estratégia de modelo incremental | O que o modelo lembra de dbt | A sua, com a chave e o `merge` que vocês usam |
| Convenção de nomes | Inventada por analogia | A do seu `naming.md` |
| Consistência entre execuções | Varia | Igual, porque a fonte é um arquivo |
| Revisão | Discute-se o código | Discute-se o pattern, e o código segue |

O KB é onde uma decisão tomada uma vez para de ser reexplicada a cada tarefa.

### Estrutura de um domínio

```text
kb/{dominio}/
├── index.md              visão geral e navegação — o agente lê isto primeiro
├── quick-reference.md    tabelas de consulta rápida        (até 100 linhas)
├── concepts/             o que é e por quê     3-6 arquivos (até 150 linhas cada)
│   ├── incremental-strategies.md
│   └── testing-framework.md
└── patterns/             como fazer, copiável  3-6 arquivos (até 200 linhas cada)
    ├── incremental-model.md
    └── snapshot-scd2.md
```

Os limites de tamanho não são estética: agente que precisa ler 600 linhas para achar uma
resposta vai parar de ler. **Concept** explica o porquê e o trade-off; **pattern** entrega
código pronto para copiar. Se um arquivo estoura o limite, ele quer virar dois.

### Criando um domínio

**1. Crie a estrutura**

```bash
mkdir -p .claude/kb/meu-dominio/{concepts,patterns}
touch .claude/kb/meu-dominio/{index.md,quick-reference.md}
```

**2. Escreva o `index.md`** — é o único arquivo que o agente lê inteiro, toda vez. Ele é um
mapa, não conteúdo:

```markdown
# Meu Domínio

> Uma linha dizendo o que este domínio cobre.

## Conceitos
| Arquivo | Cobre |
|---------|-------|
| `concepts/particionamento.md` | Como escolher chave de partição |

## Patterns
| Arquivo | Resolve |
|---------|---------|
| `patterns/carga-incremental.md` | Carga incremental com late-arriving data |
```

**3. Escreva um pattern de verdade.** O teste é: dá para copiar e usar sem editar?

```markdown
# Carga Incremental

> Quando a tabela é grande demais para full refresh e chegam fatos atrasados.

## Quando usar
- Volume acima de ~10M linhas
- Existe coluna de atualização confiável

## Implementação
\`\`\`sql
-- código completo, com os nomes e tipos que vocês realmente usam
\`\`\`

## Armadilhas
| Erro | Consequência | Em vez disso |
|------|--------------|--------------|
| Filtrar por `created_at` | Perde registro atualizado | Filtrar por `updated_at` |
```

**4. Registre em `.claude/kb/_index.yaml`** — é assim que o domínio passa a ser descoberto:

```yaml
domains:
  meu-dominio:
    name: meu-dominio
    description: "Uma linha — é isso que o agente lê ao decidir se o domínio é relevante"
    path: meu-dominio/
    entry_points:
      index: index.md
      quick_reference: quick-reference.md
```

**5. Conecte ao agente**, adicionando o domínio ao `kb_domains` de quem deve lê-lo:

```yaml
kb_domains: [meu-dominio, data-quality]
```

**6. Use no workflow**, citando o domínio no Technical Context de um DEFINE:

```markdown
| **KB Domains** | meu-dominio, sql-patterns |
```

A partir daí o DESIGN puxa os patterns desses domínios e o BUILD os consulta ao escrever
cada arquivo.

### Por onde começar

Não tente cobrir um domínio inteiro de saída. O caminho que funciona é o inverso: na próxima
vez que você corrigir a mesma coisa pela segunda vez numa revisão, **isso** é um pattern.
Escreva o arquivo, registre o domínio, e a terceira vez não acontece.

Um domínio com três patterns que vocês de fato seguem vale mais que dezoito domínios
copiados de outro projeto.

> A distribuição completa do AgentSpec traz 18 domínios prontos (dbt, spark, airflow,
> sql-patterns, data-modeling, data-quality, lakehouse, medallion, lakeflow, cloud-platforms,
> terraform, supabase, ai-data-engineering, prompt-engineering, genai, pydantic, python,
> testing) e o comando `/create-kb`, que faz os passos 1 a 4 sozinho. Nenhum dos dois vem
> neste instalador.

---

## Desinstalação

```bash
npx github:ip2cloud/agentspec-sdd --uninstall --claude
npx github:ip2cloud/agentspec-sdd --uninstall --both --dry-run
```

### Como funciona

Na instalação, o instalador grava um manifesto em `.claude/.agentspec-rdd.json`
(ou `.codex/.agentspec-rdd.json`) com **cada arquivo que ele escreveu e o hash do
conteúdo**. A desinstalação lê esse manifesto e é a única coisa em que ela se baseia —
nunca apaga um diretório inteiro às cegas.

Para cada arquivo registrado:

| Situação | O que acontece |
|----------|----------------|
| Hash bate com o instalado | Removido |
| Hash mudou (você editou) | **Mantido**, e listado no resumo |
| Já não existe | Ignorado |
| Não está no manifesto | Nunca é tocado |

Depois disso, diretórios que ficaram vazios são removidos, e o próprio manifesto some.
Diretório com qualquer coisa dentro sobrevive — junto com todos os pais dele.

### O que nunca é apagado

- **Seu trabalho** em `sdd/features/`, `sdd/reports/` e `sdd/archive/` — esses arquivos
  nascem do seu uso, não da instalação, então nunca entram no manifesto.
- **Agentes que você adicionou** por conta própria em `agents/<categoria>/`.
- **Arquivos que você editou**, a menos que passe `--force`.
- **O `AGENTS.md`**: só o bloco entre os marcadores `agentspec-rdd` é retirado. O que você
  escreveu fora dele permanece. Se o arquivo ficar sem nada além do bloco, aí sim ele é
  removido inteiro.

Exemplo real de saída, num projeto com um DEFINE em andamento e um agente editado:

```text
  * Claude Code -> /meu-projeto/.claude
    removed 59 file(s)
    kept 1 edited file(s) (use --force to remove them too)
      .claude/agents/python/code-reviewer.md
    pruned 12 empty director(ies)

  Your work under sdd/features/ and sdd/reports/ was left in place.
```

Sobraram exatamente dois arquivos: o agente editado e o `DEFINE_*.md` em andamento.

### Sem manifesto

Se não houver manifesto — instalação feita à mão, ou com uma versão anterior a esta —
a desinstalação **se recusa a rodar** e diz qual diretório apagar manualmente. Sem registro
do que foi instalado, apagar por conta própria arriscaria levar junto o seu trabalho.

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

O `sdd/README.md` instalado documenta a distribuição **completa** do AgentSpec: 29 comandos
e 18 domínios de KB. Este instalador entrega os 42 agentes e os 7 comandos de fase — os
outros 22 comandos e o KB ficam de fora. Os documentos copiados levam um aviso dizendo isso,
para você não ir atrás de um `/schema` que não foi instalado.

Sobre o KB, veja [Knowledge Base](#knowledge-base): ele é de propósito seu, não nosso.

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

O payload é o próprio `.claude/sdd`, `.claude/commands/workflow` e `.claude/agents` do
repositório — não há etapa de build nem cópia duplicada para manter em sincronia. Agente
novo colocado em `.claude/agents/<categoria>/` entra no instalador sozinho, sem configuração.

## Licença

MIT
