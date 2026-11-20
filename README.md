# agentspec-sdd

> Instala o **workflow SDD do AgentSpec** — desenvolvimento orientado a especificação em 5 fases — em um projeto, para **Claude Code** ou **Codex**.

```bash
npx github:asabocinski/agentspec-sdd --claude    # -> .claude/
npx github:asabocinski/agentspec-sdd --codex     # -> .codex/
```

Rodando sem alvo, ele pergunta qual assistente o projeto usa.

Quando o pacote estiver publicado no npm como `agentspec-sdd`, a forma curta também funciona:

```bash
npx agentspec-sdd --claude
npx agentspec-sdd --codex
npx agentspec-sdd --both
```

> Hoje o npm só tem o nome antigo, `agentspec-rdd`. Até publicar `agentspec-sdd`, use a forma
> `github:asabocinski/agentspec-sdd`.

---

## O que ele instala

O workflow de 5 fases, **os 42 agentes** e **os 18 domínios de KB** que eles declaram ler.

| Componente | Conteúdo |
|------------|----------|
| `sdd/` | Templates, `WORKFLOW_CONTRACTS.yaml`, `ARCHITECTURE.md`, diretórios de trabalho |
| 21 comandos | Fases, data engineering, KB, utilidades e review |
| 42 agentes | 6 de fase + 36 especialistas, com as categorias preservadas |
| `kb/` | 18 domínios, 222 arquivos, `_index.yaml`, `_templates/` e `shared/` |

Os 21 comandos:

| Grupo | Qtd | Comandos |
|-------|----:|----------|
| Fases | 7 | `/brainstorm` `/define` `/design` `/build` `/ship` `/iterate` `/create-pr` |
| Data engineering | 8 | `/schema` `/pipeline` `/data-quality` `/lakehouse` `/sql-review` `/ai-pipeline` `/data-contract` `/migrate` |
| Utilidades | 4 | `/meeting` `/memory` `/sync-context` `/readme-maker` |
| Knowledge | 1 | `/create-kb` |
| Review | 1 | `/review` |

Os 8 comandos de visual explainer da distribuição completa **não** entram: eles dependem de
uma skill que não faz parte deste repositório e falhariam ao ser executados.

O `/review` entra, mas o fluxo duplo dele espera o **CodeRabbit CLI** instalado à parte.
Sem ele, use a variante `--deep`, que roda só com o Claude.

> Os nomes acima são os do Codex. No Claude Code cada comando é prefixado pelo grupo —
> `/workflow:define`, `/data-engineering:schema`. Veja
> [Como chamar as fases em cada assistente](#como-chamar-as-fases-em-cada-assistente).

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

O conteúdo canônico mora em **`.base/`** — uma pasta neutra, que não pertence a nenhum
assistente. Instalar é resolver essa base para o formato do alvo:

```text
                    .base/          fonte única, neutra
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
      --claude                --codex
          │                       │
      .claude/                .codex/
```

Dentro do `.base/`, os documentos se referem a si mesmos como `.base/sdd/features/...`.
Na instalação esses caminhos são reescritos para o alvo escolhido, então nada chega ao seu
projeto apontando para uma pasta que não existe.

Os dois assistentes têm formatos diferentes, então a instalação no Codex é uma **conversão**,
não uma cópia.

### `--claude`

```text
.claude/
├── .agentspec-sdd.json      manifesto: o que foi instalado (usado na desinstalação)
├── sdd/                     templates, contratos, features/, reports/, archive/
├── commands/                21 slash commands, agrupados
│   ├── workflow/            7 de fase
│   ├── data-engineering/    8
│   ├── core/                4 utilidades
│   ├── knowledge/           /create-kb
│   └── review/              /review
├── kb/                      18 domínios + _index.yaml + _templates/ + shared/
└── agents/                  42 subagentes (invocados pela ferramenta Task)
    ├── workflow/            6 agentes de fase
    ├── data-engineering/    13 especialistas
    ├── architect/           8 especialistas
    └── ...                  python, dev, test, cloud
```

### `--codex`

```text
.codex/
├── .agentspec-sdd.json      manifesto: o que foi instalado (usado na desinstalação)
├── sdd/                     mesmos documentos, caminhos reescritos para .codex/
├── prompts/                 21 slash commands nativos, todos planos
├── kb/                      os mesmos 18 domínios, caminhos reescritos
├── agents/<nome>.toml       42 custom agents convertidos dos subagentes, cada um com seu modelo
└── AGENTS.md                descrição do workflow, para o Codex ler
```

Nada é criado fora de `.codex/`.

No Codex os agentes viram **custom agents** de projeto, todos planos em `.codex/agents/`,
porque é assim que o Codex os descobre. Cada `.toml` traz `model` e `model_reasoning_effort`,
então o agente roda no modelo que a arquitetura definiu. A categoria de origem não se perde:
o `.codex/AGENTS.md` agrupa os especialistas por categoria numa tabela.

Regras de conversão:

| De (`.base/`) | Para (Codex) | Observação |
|---------------|--------------|------------|
| `commands/workflow/define.md` | `prompts/define.md` | O Codex tira o nome do slash do nome do arquivo |
| `agents/workflow/define-agent.md` | `agents/define-agent.toml` | `model` vira `model` + `model_reasoning_effort` do Codex; `tier`, `tools` e `kb_domains` viram tabela visível |
| `.base/agents/<cat>/<nome>.md` | `.codex/agents/<nome>.toml` | Reescrito em todos os documentos copiados |
| `.base/CLAUDE.md` | `.codex/AGENTS.md` | Cada alvo tem o seu arquivo de instruções |
| `model:` de um comando de fase | Delegação ao agente da fase | Prompt do Codex não fixa modelo; o prompt manda delegar ao custom agent, que fixa |

---

## Modelos por assistente

O `.base/` **nunca nomeia um modelo concreto**. Fases e agentes declaram uma **classe de
modelo**, e o instalador resolve a classe para o assistente escolhido. O mapa fica em
[`.base/sdd/architecture/MODELS.yaml`](.base/sdd/architecture/MODELS.yaml), referenciado pelo
`ARCHITECTURE.md` e pelo `WORKFLOW_CONTRACTS.yaml`: é a fonte única da verdade.

| Classe | Claude Code | Codex | Usada por |
|--------|-------------|-------|-----------|
| `deep` | `opus` | `gpt-6.2-astra`, esforço `high` | Brainstorm, Define, Design e 6 especialistas |
| `standard` | `sonnet` | `gpt-6.2-sol`, esforço `medium` | Build, Iterate e 30 especialistas |
| `fast` | `haiku` | `gpt-6-luna`, esforço `high` | Ship |

Onde a classe vira modelo em cada alvo:

| No `.base/` | `--claude` | `--codex` |
|-------------|------------|-----------|
| `model: deep` no agente | `model: opus` no subagente | `model` e `model_reasoning_effort` no `.toml` |
| `model: deep` no comando de fase | `model: opus` no comando: a fase roda nesse modelo | O prompt delega ao agente da fase, que fixa o modelo |
| `{{model:deep}}` nos documentos | `Opus` | `GPT-6.2 Astra` |
| `model_class` no contrato | `model: "opus"` | `model: "gpt-6.2-astra"` |

Para trocar um modelo, edite o `MODELS.yaml` e reinstale com `--force`. Os modelos do Codex
são aposentados com frequência, e por isso ficam num lugar só. Uma classe desconhecida faz a
instalação falhar com erro, e o `npm test` confere que cada fase usa a classe que o contrato
manda e que nenhum modelo de um assistente vaza para o outro.

## Como chamar as fases em cada assistente

**Os nomes dos comandos não são os mesmos nos dois alvos.** O Claude Code prefixa com a
subpasta; o Codex usa só o nome do arquivo, porque lá os prompts ficam todos planos.

| Fase | Claude Code | Codex |
|------|-------------|-------|
| 0 · Brainstorm | `/workflow:brainstorm` | `/brainstorm` |
| 1 · Define | `/workflow:define` | `/define` |
| 2 · Design | `/workflow:design` | `/design` |
| 3 · Build | `/workflow:build` | `/build` |
| 4 · Ship | `/workflow:ship` | `/ship` |
| ↻ Iterate | `/workflow:iterate` | `/iterate` |
| — Pull request | `/workflow:create-pr` | `/create-pr` |

O mesmo vale para os outros 14 comandos:

| Grupo | Claude Code | Codex |
|-------|-------------|-------|
| Data engineering | `/data-engineering:schema`<br>`/data-engineering:pipeline`<br>`/data-engineering:data-quality`<br>`/data-engineering:lakehouse`<br>`/data-engineering:sql-review`<br>`/data-engineering:ai-pipeline`<br>`/data-engineering:data-contract`<br>`/data-engineering:migrate` | `/schema`<br>`/pipeline`<br>`/data-quality`<br>`/lakehouse`<br>`/sql-review`<br>`/ai-pipeline`<br>`/data-contract`<br>`/migrate` |
| Utilidades | `/core:meeting`<br>`/core:memory`<br>`/core:sync-context`<br>`/core:readme-maker` | `/meeting`<br>`/memory`<br>`/sync-context`<br>`/readme-maker` |
| Knowledge | `/knowledge:create-kb` | `/create-kb` |
| Review | `/review:review` | `/review` |

### Por que muda

É consequência de como cada assistente descobre os comandos:

```text
CLAUDE CODE                              CODEX
.claude/commands/workflow/define.md      .codex/prompts/define.md
                 └──────┬─────┘ └──┬─┘                    └──┬─┘
                    namespace     nome                      nome
                        ↓          ↓                          ↓
                 /workflow:define                        /define
```

O Claude Code varre `commands/**` e usa o **caminho** para nomear, evitando colisão entre
grupos. O Codex lê apenas `prompts/*.md`, sem subpastas, e tira o nome do **arquivo**.

Nas duas plataformas o comportamento e os argumentos são idênticos — só o nome muda.

---

## Nada é escrito na raiz do seu projeto

O instalador escreve **exclusivamente** dentro de `.claude/` e `.codex/`. Ele **não cria e
não modifica** o `CLAUDE.md` nem o `AGENTS.md` do seu projeto — esses arquivos são seus, e
já costumam existir com as regras do time.

| Arquivo | O que o instalador faz |
|---------|------------------------|
| `CLAUDE.md` na raiz | Nada. Nunca é lido nem escrito |
| `AGENTS.md` na raiz | Nada. Nunca é lido nem escrito |
| `.codex/AGENTS.md` | Criado por nós, dentro da nossa pasta |

Há teste automatizado comparando o **hash** dos dois arquivos antes e depois da instalação.

### Conectando o Codex ao workflow

Como o instalador não toca no seu `AGENTS.md`, o Codex não descobre o workflow sozinho —
ele lê o `AGENTS.md` da raiz, não o nosso. Se quiser que ele enxergue, **você** adiciona
uma linha ao seu arquivo:

```markdown
See .codex/AGENTS.md for the AgentSpec SDD workflow.
```

O instalador lembra disso no fim da execução. É a única ação manual, e é deliberada: a
alternativa seria escrever num arquivo que pertence ao seu projeto.

No Claude Code isso não é necessário — ele varre `.claude/` sozinho.

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

Os alvos também funcionam como palavra posicional: `npx github:asabocinski/agentspec-sdd codex`.

Arquivos existentes são **pulados**, não sobrescritos, a menos que você passe `--force`.
O resumo sempre informa quantos arquivos foram criados, atualizados e pulados.

---

## Knowledge Base

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

### Os 18 domínios que vêm instalados

| Grupo | Domínios |
|-------|----------|
| Data engineering | `dbt`, `spark`, `airflow`, `sql-patterns`, `data-modeling`, `data-quality` |
| Infraestrutura | `lakehouse`, `medallion`, `lakeflow`, `cloud-platforms`, `terraform`, `supabase` |
| IA | `ai-data-engineering`, `prompt-engineering`, `genai` |
| Fundamentos | `python`, `pydantic`, `testing` |

Não é uma seleção arbitrária: **todo domínio aqui é declarado por pelo menos um agente**.
`data-quality` sozinho é lido por 13 deles. Instalar os agentes sem esses domínios deixaria
o passo 1 do KB-First sem resposta.

### Criando um domínio novo

```bash
/create-kb "iceberg"
```

No Claude Code o mesmo comando é `/knowledge:create-kb "iceberg"`.

O comando cria a estrutura, escreve `index.md` e `quick-reference.md`, gera concepts e
patterns a partir dos templates em `kb/_templates/`, valida contra MCP e registra o domínio
em `kb/_index.yaml`. Depois é só citá-lo onde interessa:

```yaml
# no frontmatter do agente que deve lê-lo
kb_domains: [iceberg, lakehouse]
```

```markdown
<!-- no Technical Context de um DEFINE -->
| **KB Domains** | iceberg, lakehouse |
```

### Por onde começar a escrever os seus

Não tente cobrir um domínio inteiro de saída. Na próxima vez que você corrigir a mesma coisa
pela segunda vez numa revisão, **isso** é um pattern. Escreva o arquivo, e a terceira vez
não acontece.

Um domínio com três patterns que a sua equipe de fato segue vale mais que dezoito copiados
de outro projeto.

---

## Desinstalação

```bash
npx github:asabocinski/agentspec-sdd --uninstall --claude
npx github:asabocinski/agentspec-sdd --uninstall --both --dry-run
```

### Como funciona

Na instalação, o instalador grava um manifesto em `.claude/.agentspec-sdd.json`
(ou `.codex/.agentspec-sdd.json`) com **cada arquivo que ele escreveu e o hash do
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
- **O `AGENTS.md` e o `CLAUDE.md` da raiz**: nunca são tocados, nem na instalação nem na
  desinstalação. Se você adicionou a linha apontando para `.codex/AGENTS.md`, ela continua
  lá depois de desinstalar — remova à mão se quiser.

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

**No Claude Code:**

```bash
/workflow:brainstorm "pipeline incremental de pedidos com SCD Tipo 2"   # opcional, Fase 0
/workflow:define <doc de brainstorm, anotações ou descrição direta>     # Fase 1, gate: Clarity Score >= 12/15
/workflow:design <doc DEFINE>                                           # Fase 2, produz o manifesto de arquivos
/workflow:build <doc DESIGN>                                            # Fase 3, produz código + BUILD_REPORT
/workflow:ship <doc DEFINE>                                             # Fase 4, arquiva com lições aprendidas
```

**No Codex:**

```bash
/brainstorm "pipeline incremental de pedidos com SCD Tipo 2"   # opcional, Fase 0
/define <doc de brainstorm, anotações ou descrição direta>     # Fase 1, gate: Clarity Score >= 12/15
/design <doc DEFINE>                                           # Fase 2, produz o manifesto de arquivos
/build <doc DESIGN>                                            # Fase 3, produz código + BUILD_REPORT
/ship <doc DEFINE>                                             # Fase 4, arquiva com lições aprendidas
```

Mudanças no meio do caminho passam pelo `/workflow:iterate` (Codex: `/iterate`), que atualiza
o documento da fase e sinaliza o que cascateia para as fases seguintes — não editando o
código direto.

> Depois de instalar, **reinicie a sessão do assistente**. Comandos e agentes são carregados
> na abertura; sem reiniciar, eles não aparecem.

O contrato legível por máquina de cada fase (seções obrigatórias, quality gates, transições
de status) é o `sdd/architecture/WORKFLOW_CONTRACTS.yaml`. Ele é a fonte da verdade.

---

## Observação de escopo

O `sdd/README.md` instalado documenta a distribuição **completa** do AgentSpec, com 29
comandos. Este instalador entrega 21 — todos menos os 8 de visual explainer. Os documentos
copiados levam um aviso dizendo isso, para você não ir atrás de um `/generate-slides` que
não existe no seu projeto.

---

## Desenvolvimento

```bash
git clone git@github.com:asabocinski/agentspec-sdd.git
cd agentspec-sdd
npm test        # verificação do payload + testes de fumaça do instalador
```

Para testar um checkout local contra outro projeto, sem publicar nada:

```bash
npx /caminho/para/agentspec-sdd --claude --dir ~/algum-projeto
```

### Onde editar

**Sempre em `.base/`.** É a fonte única: não há etapa de build nem cópia duplicada para
manter em sincronia. Agente novo em `.base/agents/<categoria>/` entra no instalador sozinho,
sem configuração; o mesmo vale para comando novo em `.base/commands/<grupo>/` e domínio novo
em `.base/kb/`.

Para usar o próprio toolkit enquanto desenvolve o repositório:

```bash
npm run bootstrap    # instala .base/ -> .claude/ neste repositório
```

O `.claude/` gerado é ignorado pelo git por inteiro, inclusive `settings*.json`. **Editar um arquivo dentro do `.claude/` gerado não tem efeito** — o próximo
bootstrap sobrescreve. Edite em `.base/` e rode o bootstrap de novo.

## Publicação no npm

A publicação roda no GitHub Actions; não precisa de máquina local.

**Uma vez só:** crie no npm um *Granular Access Token* com *Read and write* e *Bypass
two-factor authentication*, e salve em **Settings → Secrets and variables → Actions** como
`NPM_TOKEN`.

**A cada versão:**

1. Suba o `version` no `package.json` (`npm version minor --no-git-tag-version`) e faça merge.
2. Em **Releases → Draft a new release**, crie a tag `v<versão>` (por exemplo `v0.3.0`) e publique.
3. O workflow **Publish to npm** confere que a tag bate com o `package.json`, que a versão
   ainda não existe no npm, roda o `npm test` e publica com *provenance*.

Também dá para disparar à mão em **Actions → Publish to npm → Run workflow**.

O workflow **Remove legacy npm package** apaga o nome antigo, `agentspec-rdd`. Ele só roda à
mão, exige digitar `agentspec-rdd` como confirmação e só prossegue se o `agentspec-sdd` já
estiver publicado. Não tem volta.

## Licença

MIT
