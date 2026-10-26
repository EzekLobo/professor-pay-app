# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any Expo or React Native code.

# Codex Operating Router

Use this file as the first stop for every Codex session in this repo.

## Context Routing

- For broad work or unfamiliar areas, read `.codex/memory/repo-map.md` first.
- Before continuing previous work, read `.codex/memory/current-state.md`.
- For a cross-cutting investigation or impact analysis in `frontend/src`, generate
  and query the local dependency graph with `npm run codex:graph:generate` and
  `npm run codex:graph -- <arquivo-ou-parte-do-caminho>`. Use it only to narrow
  the files to inspect; keep `rg` as the default for textual searches and simple
  edits. Do not make a graph query mandatory for isolated changes.
- For Expo, React Native, SQLite, or dependency changes, read `.codex/rules/expo-v56.md` before editing.
- For planning, reviewing, or Expo validation, use the role checklists in `.codex/agents/`.
- For repo-local skill guidance, read `.codex/skills/professor-pay-ops/SKILL.md`.

## Summary Rules

- Interface: preferir ícones reconhecíveis para ações secundárias, sobretudo no mobile. Botões só com ícone precisam de nome acessível, título e área de toque de ao menos 44px; manter texto nas ações principais e confirmações destrutivas.

- Para novas funcionalidades visíveis ao usuário, adicione uma entrada curta em `frontend/src/lib/release-notes.ts` com versão única crescente, comportamento entregue e atalho interno. Consulte `docs/RELEASE_NOTES.md`; não anuncie propostas ou integrações não verificadas.

- Update `.codex/memory/current-state.md` after meaningful architecture, dependency, workflow, or product-state changes.
- Add an entry to `.codex/memory/decisions.md` only for decisions likely to matter in future sessions.
- Keep summaries short and operational: where to look, what changed, what risks remain, and what commands verify it.
- Do not summarize `node_modules`, generated build output, test log dumps, binary assets, or lockfile internals.
- Do not copy Expo docs into this repo; link to the exact versioned docs and consult them when needed.
