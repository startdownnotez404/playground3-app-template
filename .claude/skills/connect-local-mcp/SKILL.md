---
name: connect-local-mcp
description: Let the Playground3 agent use tools on the user's own machine through MCP Connector (mcp.adapter.json, requires/proposals, 127.0.0.1:3920, capabilities.attachedMcp). Use for local apps, files, game clients, Blender, or any local MCP server.
---

# Connect a local MCP server

The stage iframe cannot reach `127.0.0.1`. The **host page** reaches
**MCP Connector**, a desktop app the user installs, at
`http://127.0.0.1:3920/mcp` and relays calls for the iframe over StageBridge
(`platform.attachedMcp.connect | disconnect | getRuntime | callTool`).
References: `examples/lol-tutor` and `docs/MCP_CONNECTOR_REDESIGN.md` in the
platform repo.

## What runs locally is the user's decision

The connector keeps a registry of servers that the user adds or approves.
The app can only:

- **`requires`**: name the capabilities it needs (for example
  `"league.liveclient"`).
- **`proposals`**: suggest a server that provides them. The connector shows
  the full spec (command, args, env keys, URLs), and **nothing runs until
  the user saves it**.

Proposal `spec.kind` is one of four generic kinds. The connector has no
app-specific code.

| kind | spec |
| --- | --- |
| `stdio` | `command`, `args`, `env?`, `cwd?`: a local MCP server process |
| `http` | `url` (loopback only), `mcpTransport: "streamable-http" \| "sse"`, `headers?` |
| `adapter` | `builtins: ["fetch", "fs.read"]` plus `tools: [{ name, description, inputSchema, run: { type: "http", method, url, headers?, body? } \| { type: "command", command, args } }]` |
| `script` | an app-provided JS module exporting `tools` and `callTool(name, args)`, run by the connector |

The legacy `connector` recipe field is rejected. Use `requires` and `proposals`.

## 1. `mcp.adapter.json`

Copy `samples/mcp.adapter.json` to the app root and edit it. Shape
(`Playground3McpAdapterDocument`):

```jsonc
{
  "version": 1,                      // must be 1
  "id": "local", "name": "Local tools",
  "server": { "transport": "streamable-http", "url": "http://127.0.0.1:3920/mcp" },
  "requires": ["example.fetch"],
  "proposals": [{ "id": "example-fetch", "name": "Example fetch", "provides": ["example.fetch"],
                  "spec": { "kind": "adapter", "builtins": ["fetch"], "tools": [] } }],
  "discovery": "live",               // live: use the gateway's tools/list; catalog: only catalog.tools
  "namespace": "local",              // agent sees local.fetch
  "catalog": { "tools": [ { "name": "fetch", "description": "...", "promptHint": "...",
                            "inputSchema": { ... }, "humanApproval": { "required": true } } ] },
  "approvals": { "defaultRequired": true }
}
```

- `server.url` must be loopback; the host refuses anything else.
- The gateway names tools `<serverId>__<tool>`. The host maps them back to
  `<tool>` for the servers this app was granted, then applies `namespace`.
- `catalog` entries overlay `promptHint` and `humanApproval` by name, and
  are the fallback list when the gateway returns none.
- `npm run check` validates the file.

## 2. Connect from the UI

```ts
import adapter from "../../mcp.adapter.json";
import { connectAttachedMcp, disconnectAttachedMcp } from "../host/stageBridge";
import { APP_PLAYGROUND3_ID } from "../agent/contract/manifest";

const runtime = await connectAttachedMcp(adapter, APP_PLAYGROUND3_ID);
// runtime: { adapter, routeId, liveTools, mergedManifest, lastError, ok }
```

Put this behind a **Connect** button. On first use the connector asks the
user to pair this site, and then to approve the `requires`/`proposals`. Both
prompts appear in the connector's window, and each can wait for the user for
up to about 3 minutes. Chrome may also ask for local-network access from the
HTTPS site. Show `runtime.lastError` when `liveTools` is empty.

SDK `0.1.9` on npm does not export `connectPlayground3AttachedMcp` or
`parsePlayground3McpAdapterJson`. Use `src/host/stageBridge.ts` as shown.

## 3. Let agents use the tools

- In `agentDefinitions.ts`, give the agent `capabilities.attachedMcp: "all"`
  (or a list of tool names) and list the namespaced names in
  `capabilities.tools`, as `examples/lol-tutor` does. The `0.1.9` typings do
  not declare `attachedMcp` yet, so cast the capabilities object
  (`as Playground3AgentDefinition["capabilities"]`).
- Add the namespaced names to the node's `task.tools` in the topology so
  the node is allowed to call them.
- Optionally, add the catalog tools (namespaced) to your manifest so prompts
  can describe them before the user connects.
- In `executeTool`, return a retryable failure for those names
  (`failureKind: "attachedMcpDisconnected"`, `next: "Connect …"`). The host
  answers them when the connector is connected; your handler only runs when
  it is not.

## 4. Test

- **Mock host (`npm run dev`):** `connect` returns your catalog tools and
  `callTool` echoes the args back. Use it to check the wiring and the UI
  states. Nothing touches port 3920.
- **Real connector:** load the app in Playground Author with MCP Connector
  running. Check the pairing prompt, proposal approval and a real tool
  call. In the connector, a Sites grant set to `ask` shows a prompt for
  every call.
