---
name: build-app
description: Turn this Playground3 template into a new app. Covers renaming, state, UI, agent prompts and the dev loop. Use when starting a new app or making broad changes to its shape.
---

# Build a Playground3 app from this template

Read `AGENTS.md` first. It has the architecture and the hard rules.

## 1. Name it (once)

- `app.config.json`: set `id` (a lowercase slug such as `playground3-recipe-box`),
  `title`, `fileName` (`<id>.html`) and `description`. The `id` becomes the
  StageBridge `playgroundId` and the key for records, secrets and the
  published bundle, so do not change it after you publish.
- `index.html` `<title>` and `package.json` `name`.
- `src/definition.ts` reads `id` and `title` from `app.config.json`; do not
  hardcode them anywhere else.
- Run `npm run check`.

## 2. State

- `src/runtime/types.ts`: the `AppState` the iframe owns.
- `src/runtime/checkpoint.ts`:
  - `createInitial()` returns the empty state.
  - `serialize(state)` returns JSON for the host checkpoint. Keep it small;
    the host caps frontend state at about 350 KB.
  - `parse(json)` must tolerate old or garbage JSON and fall back to the
    initial state. It runs on resume.
  - `buildAppCheckpointPromptView(state)` is the compact view the model
    sees. Include only what the agent needs to decide.
- After a user edit, call `setState(next)` and then
  `actions.persistCheckpoint(next, "user")` (see `src/ui/Shell.tsx`).

## 3. UI

- `src/ui/Shell.tsx` receives `Playground3UiProps<AppState>`: `state`,
  `setState`, `actions` (`persistCheckpoint`, `runTurn`, `beginTurn`,
  `setStatus`, `setError`, …), `isRunning`, `canInvoke`, `isPrimary`,
  `status`, `error`, `graphCatalog`, `selectedGraphKey`.
- Use MUI (`@mui/material`) and `@startdownnotez404/ui` widgets. Theme
  colors come from `--mui-palette-*` CSS variables, so the app follows the
  host's light/dark mode. Keep the canvas transparent.
- Free text goes to the agent through the host composer (ChatDock). The app
  does not need its own chat box. To start a turn from a button, see
  `actions.runTurn` in the SDK types (`Playground3HostActions`).
- `Shell` is lazy-loaded in `definition.ts`. Keep it that way so tooling can
  import the definition without React DOM.

## 4. Agent

- Tools: follow `define-mcp-tools`.
- `src/agent/orchestration/main.topology.json` is one `execute` node
  (`assist`) run by the `assistant` subagent, with `task.tools` listing the
  tools it may call. Add nodes, edges and groups for multi-step graphs. To
  add another mode, add a topology file plus prompts, a `buildGraphJson`,
  and an entry under `orchestration.graphs` in `src/definition.ts`.
  `entry.modeType` is `ask` | `agent` | `play` | `plan`; `textInput: true`
  shows the composer.
- `prompts.ts` holds the persona (`agents.<id>.agentPersona`) and per-node
  `task.goal`. `agentDefinitions.ts` holds `capabilities` (`tools`,
  `askHuman`, `loadSkills`, `spawnSubagents`, …).
- `src/agent/RULE.md` holds always-on app rules. `src/agent/skills/<id>/SKILL.md`
  holds loadable skills; list each `<id>` in `manifest.skills` and preload
  it with `task.preloadSkills`.

## 5. Loop

```bash
npm run dev        # mock host: call tools, /call in the composer, records, secrets
npm run check
npm run typecheck
npm run build      # then /dev/host.html?bundle=dist/index.html
```

The mock host has no model. Real turns with an LLM run only in Playground
Author. Before you hand off, load the zip there (`package-and-submit`).
