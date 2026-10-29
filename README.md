# Playground3 app template

A minimal Playground3 Stage app: a note list plus one MCP tool
(`notes.addNote`) that the agent calls to change it. Clone it, build your app
on a laptop against a local mock host, then zip it and load it in Playground
Author.

> **Where this lives.** This repo is generated from
> [`startdownnotez404/monorepo` → `templates/playground3-app`](https://github.com/startdownnotez404/monorepo/tree/dev/templates/playground3-app)
> and overwritten on every sync. Start your own app with **Use this template**
> or `npx degit startdownnotez404/playground3-app-template my-app`. Send
> changes to the template itself to the monorepo, not here.

```bash
npm install
npm run dev        # opens dev/host.html, a mock StageBridge host
npm run check      # Author + app-store rules (manifest, lockfile, deps allowlist, files)
npm run build      # dist/index.html, one self-contained file
npm run zip        # <id>.zip with exactly the files Author keeps
```

## Pinned versions

| Package | Version | Notes |
| --- | --- | --- |
| Node | 22 (`.nvmrc`), ≥ 20 | |
| `@startdownnotez404/playground3-stage-sdk` | **`0.1.10`** (exact) | Same pin as Author's overlay (`PLAYGROUND3_STAGE_SDK_VERSION`). `npm run check` fails on any other value. |
| `@startdownnotez404/ui` | `^1.3.12` | Widgets, `/theme`, `/chart`, `/markdown`, `/flowMap`. Public npmjs. |
| `react`, `react-dom` | `18.3.1` | |
| `vite` | `^5.4.11` (resolves 5.4.21) | `vite-plugin-singlefile` 2.3.4 needs ≥ 5.4.21, so an exact `5.4.11` pin can't install. `^5.4.11` is the range Author's overlay uses. |
| `@vitejs/plugin-react` | `^4.3.4` (4.x) | |
| `vite-plugin-singlefile` | `^2.3.0` | Required. The published app is one HTML file. |
| `@mui/material`, `@emotion/*` | `^7.3.9`, `^11.14` | Peer deps of ui and the SDK. |
| `esbuild` (override) | `0.24.2` | Same override the WebContainer scaffold uses. |

Commit `package-lock.json`: the app store requires it (npmjs-only
`resolved` entries with integrity hashes). Author's WebContainer strips it
and runs a fresh `npm install` from these ranges, so keep both valid.

## Layout

```
app.config.json             id (= StageBridge playgroundId), title, fileName, appSecrets, appRecords
index.html                  transparent canvas + appearance bootstrap (keep it)
vite.config.mjs             react + singlefile + the serve-only dev host plugin
src/main.tsx                mountPlayground3StageApp(...)
src/definition.ts           Playground3Definition: contract, orchestration, runtime, ui
src/agent/contract/manifest.ts   MCP tools the agent sees (Playground3McpManifest)
src/agent/orchestration/    topology JSON, prompts, agent definitions
src/agent/RULE.md           app rules embedded into the bundle
src/agent/skills/<id>/SKILL.md   app skills embedded into the bundle
src/runtime/                state type, checkpoint adapter, tool handler
src/ui/Shell.tsx            your UI (Playground3UiProps)
src/host/stageBridge.ts     records / secrets / third-party / attached MCP over StageBridge
samples/APIShape.json       commented sample: third-party calls with {{secret.NAME}}
samples/mcp.adapter.json    commented sample: local MCP through MCP Connector
dev/                        local mock host (not part of the build)
scripts/                    check + zip
AGENTS.md, CLAUDE.md, .claude/skills/   docs for AI coding agents
```

## Local dev harness

`npm run dev` starts Vite and opens `/dev/host.html`. That page plays the
part of Playground Author / `/playground3/bundle`: it iframes the app with
`#playgroundId=<app.config.json id>` and answers the StageBridge
protocol. Use it to:

- **Call your MCP tools.** Every tool from `stage.getTurnContext` is listed
  with an args box and a Call button.
- **Run mock turns.** There is no model. `/call <tool> <json>` in the
  composer simulates the model calling a tool. Other text gets a canned reply.
- **Use app records.** Rows are stored in `localStorage`. Kinds must be
  declared in `appRecords`, and each row is capped at 16 KB, as on the backend.
- **Use secrets and third-party calls.** Put `PG3_SECRET_<NAME>=…` in
  `.env.local` (see `env.example.txt`). The Vite process injects the value into
  the matching `APIShape.json` call and redacts it from the response. The
  iframe only ever sees `last4`.
- **Use the attached MCP.** `platform.attachedMcp.connect` returns your
  adapter's catalog tools and `callTool` echoes the args back. To reach the
  real MCP Connector on `127.0.0.1:3920`, test in Author.
- **Test the built file.** Run `npm run build`, then open
  `/dev/host.html?bundle=dist/index.html` to test the exact file Author
  publishes.
- Toggle light/dark, watch checkpoints, and read the StageBridge log.

The harness lives in the template (`dev/`), not in the SDK. The Stage SDK is
an opaque npm package pinned to `0.1.10`, and a dev host inside it would need a
new SDK release before any template could use it. The mock speaks the same
postMessage protocol the real host does, so the app code is identical in both.

## Ship it

1. Run `npm run check` and fix every error.
2. Run `npm run zip`.
3. In `/playground3/author`, use **Load zip** (or paste the GitHub URL) and
   let the WebContainer build it.

Details are in `.claude/skills/package-and-submit/SKILL.md`.
