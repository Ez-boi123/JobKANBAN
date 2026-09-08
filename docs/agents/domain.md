# Domain docs

## Layout

This repository uses a single-context layout:

- `CONTEXT.md` at the repository root.
- Architecture decision records in `docs/adr/`.

## Before exploring

Read `CONTEXT.md` and ADRs relevant to the area being explored.

If these files do not exist, proceed silently. Do not flag their
absence or suggest creating them upfront. The domain-modeling skill
creates them when domain terms or decisions are resolved.

## Vocabulary

Use the domain terms defined in `CONTEXT.md` in issues, proposals,
hypotheses, and tests. Avoid synonyms the glossary rejects.

If a needed concept is missing, reconsider the term or note the gap
for domain-modeling.

## ADR conflicts

Explicitly flag proposals that contradict an existing ADR.
Identify the ADR and explain why its decision should be reconsidered.
