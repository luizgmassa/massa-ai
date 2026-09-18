# Plano de execução — enxugar os 40 workflows de `skills/massa-ai/`

**Status:** aprovado pelo usuário (Plannotator, sessão de 2026-09-18). Escopo e decisões abaixo são finais.
**Base:** `main` @ `95f752f1`. Corpus: 40 workflows, 4.870 linhas; referências 12.777 linhas.
**Para executar em sessão limpa.** Leia a Fase 0 antes de qualquer edição — ela corrige uma premissa errada do relatório que gerou este plano.

---

## Decisões do usuário

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Escopo | **Tudo**: A1+A2+A3+A4 (dedup estrutural), A5 (tiers), A6+A10 (números e lentes), A9 (erros concretos) |
| 2 | Scripts | **Os quatro**: religar `check_commit.ts` + criar `size_change.ts`, `resolve_scope.ts`, `ensure_worktree.ts` |
| 3 | Âncoras de validador | **Mover para fixture de teste** (`scripts/__tests__/workflow-anchors.json`) |
| 4 | `skill-architect.md` | **Corrigir os 3 erros + mover prosa genérica para `references/skill-architect/`** |

---

## FASE 0 — Correção de premissa (obrigatória, antes de editar)

O relatório que originou este plano mediu 668 instâncias de linha duplicadas e propôs remover quatro blocos de preâmbulo e os 57 blocos `Dispatch`. **Verificação posterior mostrou que a maior parte dessa duplicação é contrato testado e deliberado**, não deriva acidental. Os gates:

| Alvo do relatório | Gate que o fixa | Assertiva |
|---|---|---|
| Linha de intake `references/project-context.md` | `scripts/__tests__/workflow-harness-contract.test.ts:213` | substring presente em **todos os 40** |
| Linha das 3 referências de mutação | mesmo arquivo, `:233-239` | os 3 paths presentes nos 16 de implementação |
| `**Isolation Gate — before the first file edit:**` | mesmo arquivo, `:244-280` | presente nos 16, **ausente nos 24 read-only**, e **byte-idêntica** nos 16, contendo `Stage 0–1`, `record the worktree path + branch`, `two legal skip reasons, verbatim` |
| `**Reuse Scan — before writing new implementation code:**` | mesmo arquivo, `:566-580` | presente nos 16 e **byte-idêntica**, texto completo fixado |
| Bloco `Dispatch: massa-ai-reviewer` + a linha `persona: optional …` | `scripts/__tests__/agent-era-guidance-content.test.ts:345,349` | texto **verbatim** |
| Bloco `Dispatch: massa-ai-verification-agent` e sua ordem relativa ao reviewer | mesmo arquivo, `:383,394` | verbatim + ordenação |
| Bloco `Dispatch: massa-ai-designer` | `workflow-harness-contract.test.ts:806` | header presente |
| Qualquer bloco `Dispatch:` | `scripts/__tests__/skills-harness-integrity.test.ts:93-180,673` | parseado como run contíguo de `> `; precisa nomear agente existente e carregar a cláusula obrigatória |
| Volume total de duplicação | `scripts/__tests__/skills-duplication-metric.test.ts`, `EXCESS_CEILING = 498` | teto, não igualdade |

Os comentários de `EXCESS_CEILING` registram por escrito que os aumentos de 331 → 471 → 483 → 498 foram **"mandated uniformity, not prose drift"** — frontmatter YAML em 36 arquivos (WMH-01/02), template do reviewer em 14 (AEH-06), template do designer (DSG-05/06). O repositório já tomou essa decisão três vezes.

**Recalibração honesta dos números:** as quatro linhas de preâmbulo são **uma linha cada, por arquivo** — não parágrafos. Volume real: intake 39 + delivery 16 + Isolation Gate 16 + Reuse Scan 16 = **87 linhas**, e todas as quatro já são invocações de política externalizada, exatamente o padrão que o relatório recomendou adotar. O relatório superestimou esse item ("~110 linhas", "5 blocos").

**Portanto, A2 e A3 não são "remover redundância" — são "reverter quatro decisões arquiteturais anteriores, cada uma com gate e justificativa escrita".**

### Ação da Fase 0

1. Ler os três arquivos de teste citados acima na íntegra antes de tocar em qualquer workflow.
2. Apresentar ao usuário, via `AskUserQuestion`, um go/no-go **item por item** para A2 e A3, com o custo real na mesa: editar gate + apagar a justificativa registrada, contra ~87 linhas (A3) e ~450 linhas (A2).
3. **Não editar A2 nem A3 sem esse go/no-go.** A1, A4, A5, A6, A7, A8, A9, A10 e skill-architect seguem sem bloqueio — nenhum é fixado por teste (verificado: `grep` por `Bounded Fix`, `two consecutive failed fixes`, `Modified files scope`, `Establish the investigation scope`, `skill-architect` em `scripts/__tests__/*.ts` não retorna assertivas de conteúdo).

---

## Fases de execução

Ordem escolhida por risco crescente e por estabilidade de linha: itens de span disjunto e arquivos-folha primeiro; mudança de comportamento por último. Ao editar spans disjuntos no mesmo arquivo, **aplicar o span de baixo para cima** para não invalidar os números de linha dos seguintes.

### Fase 1 — A9: os 5 erros concretos (sem bloqueio, trivial)

| Arquivo:linha | Correção |
|---|---|
| `skills/massa-ai/workflows/skill-architect.md:274` | `bun scripts/validate_skill.ts` → `bun skills/massa-ai/scripts/validate_skill.ts` (os outros 43 comandos do corpus usam esse prefixo) |
| `skill-architect.md:338` | remover `present_files` — a ferramenta não existe neste harness; trocar por "apresentar a árvore de arquivos criada" |
| `skill-architect.md:350` e `:367` | remover as duas rotas para o skill `skill-creator`, inexistente no repositório (`ls skills/` → `agents bootstrap massa-ai persona-router profile`) |
| `references/agent-orchestration.md:133` e `:140` | dois headings `## Roles` consecutivos; fundir em um |
| `workflows/mobile-figma/mobile-figma-audit.md:61-72` | bloco designer com `permissions: write` colado em workflow *findings-only*, corrigido por prosa ("Restrictions win over the packet, so read-only governs"). **Atenção:** `workflow-harness-contract.test.ts:806` fixa o header desse bloco — verificar se esse arquivo está no conjunto assertado antes de remover; se estiver, ajustar o bloco para `permissions: read-only` em vez de removê-lo |

**Brinde:** `workflow-harness-contract.test.ts:14` diz "the 19 read-only ones", mas `:296` assere 24 (40 − 16). Comentário obsoleto; corrigir para 24.

**Verificação:** `bun test scripts/__tests__/workflow-harness-contract.test.ts scripts/__tests__/workflow-metadata-headers.test.ts`

### Fase 2 — A1 + A4 + A6: dedup não fixada por teste

**A1 — "dois contadores" (~45 linhas).** Remover o parágrafo de disambiguação de 13 arquivos e deixá-lo uma vez em `references/verification-ladder.md`, na seção do `Bounded Fix→Re-verify Loop`:

`debug.md:96` · `feature.md:94` · `general.md:90` · `refactor.md:93` · `bugs-fix.md:109` · `security-fix.md:114` · `tests-fix.md:106` · `requirements-fix.md:111` · `code-quality-fix.md:119` · `architecture-fix.md:117` · `implementation-fix.md:115` · `maestro-fix.md:104` · `mobile-figma-fix.md:122`

Em cada um, substituir por: `O cap do fix→re-verify e o breaker de dois fixes falhados são contadores distintos — ver references/verification-ladder.md.`

**A4 — enumeração de escopo nos audits (~84 linhas).** Apagar o passo "Establish the investigation scope" (11 bullets) de:

`bugs-audit.md:29-40` · `security-audit.md:30-41` · `tests-audit.md:42-53` · `requirements-audit.md:29-42` · `code-quality-audit.md:31-42` · `architecture-audit.md:33-44`

Justificativa: o passo 2 do mesmo arquivo já manda carregar `references/audit-scope.md`, que é a fonte. `requirements-audit.md` tem dois bullets extras (`:39` fonte de requisitos, `:41` pedir a fonte) — **preservar esses dois**, são delta real. Substituir o bloco por: `Resolver o escopo por references/audit-scope.md (Lens Audit Scope Resolution Procedure, linha <Lente> de Per-Lens Scope Deltas).` — que é o que o passo 5 já diz; na prática, apagar o 4 e manter o 5.

**A6 — parar de reproduzir números que a referência possui.** Trocar o valor literal por citação da referência:

- `>200 lines, >20 KB, or >50 search hits` → `o limiar de references/context-firewall.md` em `feature.md:29`, `debug.md:28`, `refactor.md:32`
- thresholds Quick/Standard/Spec-driven restated em 13 arquivos → resolvidos pela Fase 4 (`size_change.ts`)

**Verificação:** `bun run test:scripts` inteiro (81 suítes TS + 37 shell). Esperar verde; `EXCESS_CEILING` **desce**, e um teto nunca reprova por folga.

**Ao final desta fase, baixar `EXCESS_CEILING`** em `skills-duplication-metric.test.ts:91` para o novo valor medido, com comentário no mesmo formato dos anteriores (delta diferencial contra `main`, qual bloco saiu). Sem isso, o ganho não fica travado e a regrowth volta invisível.

### Fase 3 — A7: âncoras para fixture

Mover os 16 comentários `<!-- validator anchors: … -->` para `scripts/__tests__/workflow-anchors.json`, no formato `{ "<workflow rel path>": ["âncora", …] }`.

Arquivos com âncora: `general.md`, `feature.md`, `debug.md`, `refactor.md`, `spec-driven.md`, `to-prd.md`, `pr-review.md`, `long-session.md`, `bugs-fix.md`, `security-fix.md`, `tests-fix.md`, `requirements-fix.md`, `code-quality-fix.md`, `architecture-fix.md`, `implementation-fix.md`, `maestro-fix.md`, `mobile-figma-fix.md`.

Cuidado: nenhum teste **lê** esses comentários — são notas humanas do tipo "não reescreva esta linha", enquanto os greps de verdade vivem em `agent-era-guidance-content.test.ts` e `workflow-harness-contract.test.ts`. Mover é seguro, mas o valor da nota (avisar o próximo editor) se perde se o JSON não for citado. **Atualizar `CONTRIBUTING.md`** (protocolo de 7 passos, passo "invariants") apontando para o novo fixture.

**Verificação:** `bun run test:scripts` + confirmar que o JSON cobre 100% das âncoras removidas, contando antes e depois.

### Fase 4 — A8: os quatro scripts

Todos em `skills/massa-ai/scripts/`, Bun builtins apenas, zero dependências, saída determinística, exit code não-zero em falha — seguir o padrão de `check_commit.ts`.

1. **Religar `check_commit.ts`** (já existe, 231 linhas). Seu docblock declara implementar `workflows/commit.md §8`, mas `commit.md` **nunca o invoca**; o único chamador é `references/spec-driven/execute.md:307`. Em `commit.md`, substituir os 7 bullets de formato (`:38-45`) por: `Validar a mensagem com bun skills/massa-ai/scripts/check_commit.ts --message "<msg>"; exit não-zero bloqueia o commit.` Manter a regra do prefixo Jira em prosa — o script a considera, mas não a deriva.
2. **`size_change.ts`** — lê `git diff --numstat` (e `--cached`), imprime arquivos, LOC e o tier (`quick` ≤3 arquivos e ≤200 LOC; `standard` ≤10 ou ≤500; `spec-driven` acima). Substitui "Use the exact Quick, Standard, and Spec-driven thresholds" em 13 workflows. Maior alavanca de token por sessão: torna dispensável carregar `references/verification-ladder.md` só para dimensionar.
3. **`resolve_scope.ts --scope modified|range|branch|files|whole`** — emite o scope packet (tipo, target focus, método de resolução, base/head, arquivos resolvidos, exclusões, timestamp de freshness) em JSON. Substitui o que a Fase 2 apagou como prosa nos 7 audits.
4. **`ensure_worktree.ts`** — executa Stage 0–1 de `references/implementation-delivery.md` (fetch da base, cria worktree + branch) e imprime path + branch, ou a razão de skip válida. **Não remove a linha da Isolation Gate** dos workflows: ela é byte-idêntica e testada (Fase 0). O script passa a ser o *como*; a linha continua sendo o *quando*.

Cada script novo precisa de teste próprio em `scripts/__tests__/` com red observado — um checker recém-escrito não vale nada até falhar de propósito (`bun test <arquivo>` com input inválido antes de tornar verde).

**Verificação:** `bun run lint` (oxlint, categoria `correctness` em `error`, roda da raiz e alcança `scripts/`) + `bun run test:scripts`.

### Fase 5 — A10 + skill-architect: extrair prosa para `references/`

**A10 — lente de code quality.** `code-quality-audit.md:85-113` tem ~60 linhas de lente SOLID/Clean Code/KISS/YAGNI/DRY inline, e `code-quality-fix.md:58-64` repete ~8 linhas das mesmas regras. `architecture-audit.md` já faz o oposto (3 `references/architecture-*-lens.md` carregadas sob condição). Criar `references/code-quality-lens.md` e citá-la dos dois arquivos.

**Bloqueio conhecido:** `agent-era-guidance-content.test.ts:35-99` faz grep **verbatim** nessa prosa — "KISS lead is preserved verbatim", o critério discoverability-or-change-risk, o lead de SRP, o limite de ~600 linhas, e os mesmos critérios em `code-quality-fix.md`. Extrair exige **repontar esses greps para o novo arquivo**, não apagá-los. Repontar por identidade de conteúdo, não por delta de linha.

**skill-architect.md** (373 linhas, o maior workflow). Mover para `references/skill-architect/` a prosa genérica: `Core Philosophy` (`:18-29`), `Workflow Overview` ASCII (`:32-40`), `Conversation Style` (`:354-363`). Manter no SKILL.md as 5 fases, os exit criteria, as hard rules de frontmatter e as Important Boundaries. Alvo ~180 linhas.

Duas restrições:
- O diretório já tem `patterns.md`, `examples.md`, `quality-checklist.md`, `ATTRIBUTION.md`. Cada arquivo **novo** precisa ser nomeado por path completo em um arquivo vivo, senão `scripts/skills-reference-graph.ts` o marca órfão (`orphans` = `referents.length === 0`) e `skills-duplication-metric.test.ts` reprova na checagem de reachability.
- `workflow-metadata-headers.test.ts:10,112` permite `license: CC-BY-4.0` neste arquivo por ser conteúdo de terceiro. **Preservar a atribuição** (`:9-10`, Felipe Rodrigues / Useful-Agent-Skills) e o campo `license`.

### Fase 6 — A5: tiers (única mudança de comportamento)

Amarrar ao tier do Verification Ladder o que hoje é incondicional:

| Hoje | Depois |
|---|---|
| `reviewer` = `never optional` em 14 arquivos, sem tier | dispatch a partir de Standard; em Quick, fresh-eyes local com razão registrada |
| Isolation Gate (worktree novo) em 16, sem tier | **decisão pendente da Fase 0** — `workflow-harness-contract.test.ts:326` assere que `implementation-delivery.md` "grants worktree isolation no size exemption". Introduzir tier aqui **contradiz diretamente** essa invariante testada. Requer go/no-go explícito e edição do gate com justificativa |
| Reuse Scan `mandatory` em 16, sem tier | mesma situação: linha byte-idêntica e fixada (`:566-580`) |

Rodar o **Plan Challenge Gate completo** (`workflows/the-fool.md`, modo `pre_mortem`) antes de aplicar a Fase 6: é mudança de política de verificação em domínio de risco, exatamente o caso que a política manda desafiar.

Efeito esperado por sessão: em `feature.md`, tornar condicionais `verification-ladder.md` + `code-reuse-scan.md` + `implementation-delivery.md` no tier Quick reduz a cadeia de pior caso de ~2.400 para ~900 linhas.

### Fase 7 — A2: blocos Dispatch (somente com go/no-go da Fase 0)

57 blocos, ~630 linhas. `references/agent-orchestration.md:188` já declara que o bloco é "the block projection of this packet" e `:184` já define a semântica de `persona` — copiada verbatim 57 vezes.

Distribuição: `verification-agent` 16× · `reviewer` 15× · `builder` 8× · `designer` 7× · `audit-specialist` 7× · um cada de `meta-judge`, `judge`, `investigator`, `furps-analyst`, `architecture-specialist`.

Proposta: bloco canônico por papel em `agent-orchestration.md`; no workflow, duas linhas com apenas os deltas (`trigger`, `scope`) quando os demais campos são o padrão do papel.

Custo real: editar `agent-era-guidance-content.test.ts:345,349,383,394`, `workflow-harness-contract.test.ts:806`, o parser de `skills-harness-integrity.test.ts:93-180,673`, e apagar a justificativa registrada em `skills-duplication-metric.test.ts` (AEH-06, DSG-05/06). **Não iniciar sem aprovação.**

---

## Não mexer

`pr-review.md` (246 linhas) — command map determinístico, semântica de flags `-F`/`-f` verificada contra doc oficial, contrato explícito. É a referência de qualidade do conjunto.
`judge-with-debate.md` (210) — protocolo fixo, números concretos, channel discipline.
`onboarding.md` (31) e `long-session.md` (52) — já enxutos.
`discovery.md` (204) — a prosa **é** o produto; comprimir destrói o workflow.
`the-fool.md` (90), `rfc.md` (63), `tdd.md` (79), `ticket.md` (51), `adr.md` (42) — sem achados materiais.

---

## Protocolo obrigatório do repositório

`CONTRIBUTING.md` define o **protocolo de 7 passos para harness gerenciado** e vale para qualquer mudança em skills, workflows, agents, plugins, MCP servers ou permission rules: contrato → registro → preservar argv → export read-only → deliver-before-ack → invariantes → testes discriminantes. Ler antes da Fase 1.

Gates a rodar, na ordem:

```bash
bun run generate:artifacts          # obrigatório após tocar skills/ — bundles são gitignored e gerados on-demand
bun run generate:artifacts -- --check
bun run lint                        # oxlint da raiz, categoria correctness = error
bun run test:scripts                # inclui skill-artifact-parity, subagent-parity, workflow-harness-contract
bun test scripts/__tests__/skills-duplication-metric.test.ts
bash scripts/install-skills.sh --check
```

Ainda:

- **CHANGELOG é merge gate.** Um PR que não modifica `CHANGELOG.md` reprova, salvo label `no-changelog`. Adicionar entradas sob `[Unreleased]`, seguindo a tabela heading→bump de `CONTRIBUTING.md` § "CHANGELOG authoring".
- **Nunca escrever o marcador de skip-ci literalmente** em mensagem de commit ou corpo de PR — o GitHub varre a mensagem inteira e o squash concatena os corpos; isso já pulou o CI e travou a release v1.3.0. Chamar de "o marcador de skip-ci" em prosa.
- `.github/workflows/skills.yml` valida somente frontmatter de `SKILL.md`; não roda teste. Não confiar nele como sensor de conteúdo.
- Branch antes de commitar; `main` exige PR + 5 checks. Sem self-merge sem review.

## Sequência sugerida de PRs

1. **PR 1** — Fases 1 + 2 (erros concretos + dedup não fixada + baixar `EXCESS_CEILING`). Risco baixo, ganho imediato, nenhum gate reescrito.
2. **PR 2** — Fase 4 (scripts) + Fase 3 (âncoras). Aditivo, com testes próprios e red observado.
3. **PR 3** — Fase 5 (extrações para `references/`, com greps repontados).
4. **PR 4** — Fase 6 (tiers), após Plan Challenge completo.
5. **PR 5** — Fase 7 (Dispatch), somente se a Fase 0 liberar.
