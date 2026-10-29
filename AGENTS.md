# AGENTS.md: Playground3 app

This repo is one Playground3 **Stage app**: a Vite + React app that compiles
to a single HTML file and runs in an iframe on the Playground3 site. Read
this file before you change anything. Skills for specific tasks are in
`.claude/skills/*/SKILL.md`.

## How it runs

```
Playground3 host page (Author / /playground3/bundle)       ← you do NOT write this
  owns: agent loop, LLM inference, MCP client, ChatDock, human approval gates,
        secrets (KMS), app records (Dynamo), MCP Connector access
        │  postMessage "playground3.stageBridge" v1
        ▼
Stage iframe = this app
  owns: UI, live state, executeTool, checkpoint serialize/parse,
        topology + prompts + MCP manifest + skills
```

- The host loop calls your tools with `stage.callTool`. They run in the
  iframe through `definition.runtime.executeTool` (`src/runtime/tools.ts`).
  The host never imports your React state.
- `mountPlayground3StageApp` (`src/main.tsx`) wires StageBridge for you.
  `src/host/stageBridge.ts` covers the host features that SDK `0.1.9` does
  not wrap: records, secrets, third-party HTTP and attached MCP.
- Outside a host (a plain Vite tab) the app renders, but every host call
  fails. Use `npm run dev`, which opens `dev/host.html`, a mock host.

## Commands

| Command | Use |
| --- | --- |
| `npm run dev` | Vite plus the mock host at `/dev/host.html`. `/call <tool> <json>` in its composer simulates the model calling a tool. |
| `npm run check` | Validates `app.config.json`, `APIShape.json`, `mcp.adapter.json`, the SDK pin and zip contents, using the host's rules. **Run it after every config change.** |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run build` | `dist/index.html`, a single file. Check it at `/dev/host.html?bundle=dist/index.html`. |
| `npm run zip` | `<id>.zip` for Author → Load zip. |

Done means `npm run check`, `npm run typecheck` and `npm run build` all
pass, and the change works in the mock host.

## Hard rules

1. **Pin `@startdownnotez404/playground3-stage-sdk` to exactly `0.1.9`.** Do
   not use GitHub Packages, a GitHub Release URL, `github:`, `file:`,
   `vendor/` or a range. Import only from the package root (and
   `@startdownnotez404/ui`, `/theme`, `/chart`, `/markdown`, `/flowMap` for
   widgets). The npm `0.1.9` build does **not** export
   `connectPlayground3AttachedMcp`, `parsePlayground3McpAdapterJson`,
   `AppFileUpload` or `Playground3AppSecretField`. Use
   `src/host/stageBridge.ts` instead.
2. **Never import platform internals**: `@/shared/playground3/agent|executor|contracts`,
   `FrontendGraphTurnExecutor`, `runAgentLoop`, Amplify, ChatDock. They do
   not exist in the sandbox: Author rejects workspaces that carry them, and
   `npm run check` flags the imports.
3. **`app.config.json` `id` is the StageBridge `playgroundId`**, and is
   also the key for records, secrets and the published bundle. It must be a
   lowercase slug of 2–63 characters (`a-z 0-9 -`) and equal the store app
   id. Choose it once and do not change it. `fileName` must end in `.html`.
4. **No secret values anywhere in the repo.** That covers `app.config.json`,
   `APIShape.json`, source, `VITE_*` env and the bundle. Declare names in
   `appSecrets`/`scopedSecrets`; the user enters values in ChatDock. See
   `secrets-and-records`.
5. **Never send `playgroundId`, `url`, `shapeJson` or `scope` from the
   iframe.** The host stamps them from the session and rejects them if sent.
6. **The frontend owns state.** The agent changes it only through MCP tools.
   A tool handler returns the next state at `data.state` via
   `playground3OkToolResult(message, { ...data, state })`. Failures use
   `playground3FailToolResult(message, { retryable, failureKind, next })`.
7. **Every tool name must match in three places**: the manifest
   (`src/agent/contract/manifest.ts`), the topology (`actions[].actionType`
   plus `nodes.*.task.tools`) and `executeTool`. The agent definition's
   `capabilities.tools` must list it too.
8. **Store submission rules**: commit `package-lock.json` (npmjs only);
   `build` stays `vite build`; no install lifecycle scripts; direct deps
   only from the store allowlist (`package-and-submit` lists them); no
   `.npmrc`. `npm run check` enforces all of this.
9. **One HTML file.** Keep `vite-plugin-singlefile`, `assetsInlineLimit`
   and `cssCodeSplit: false`. Assets must be `.svg` or inlined data URLs in
   `.ts`. Author drops `.png`, `.jpg`, fonts and other binaries from the zip.
10. Keep `index.html`'s transparent canvas, `color-scheme: light !important`
   and the appearance bootstrap script. The host theme depends on them.
11. Keep `vite.config.mjs` shaped as it is (literal `optimizeDeps.exclude`
    for the SDK). Author rewrites it by pattern; see `package-and-submit`.

## Where things go

| Change | File(s) |
| --- | --- |
| UI | `src/ui/Shell.tsx` (`Playground3UiProps<AppState>`: `state`, `setState`, `actions`, `isRunning`, `status`, `error`, …) |
| State shape | `src/runtime/types.ts`, `src/runtime/checkpoint.ts` (`createInitial` / `serialize` / `parse`), `buildAppCheckpointPromptView` (what the prompt sees) |
| New agent tool | `define-mcp-tools` skill |
| Prompts / modes | `src/agent/orchestration/*.topology.json`, `prompts.ts`, `agentDefinitions.ts`, then a graph entry in `src/definition.ts` |
| App rules / skills for the agent | `src/agent/RULE.md`, `src/agent/skills/<id>/SKILL.md` (embedded by `src/stage/embeddedContent.ts`; `<id>` must match `manifest.skills[].id`) |
| API keys / third-party HTTP | `secrets-and-records` skill, `samples/APIShape.json` |
| Saved data across sessions | `secrets-and-records` skill (app records) |
| Local machine tools (MCP) | `connect-local-mcp` skill, `samples/mcp.adapter.json` |
| Ship | `package-and-submit` skill |

## Skills

- `.claude/skills/build-app/SKILL.md`: turn this template into your app.
- `.claude/skills/define-mcp-tools/SKILL.md`: add or change agent tools (`Playground3McpManifest`).
- `.claude/skills/connect-local-mcp/SKILL.md`: `mcp.adapter.json`, MCP Connector on `127.0.0.1:3920`, `capabilities.attachedMcp`.
- `.claude/skills/secrets-and-records/SKILL.md`: `appSecrets`, `APIShape.json`, app records.
- `.claude/skills/package-and-submit/SKILL.md`: zip rules and loading in Author.
