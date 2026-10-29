---
name: define-mcp-tools
description: Add or change the MCP tools the Playground3 agent can call (Playground3McpManifest, executeTool, topology wiring). Use whenever a tool is added, renamed, or its arguments change.
---

# Define MCP tools

The agent loop runs on the host. A tool call travels as `stage.callTool`
into the iframe and then to `definition.runtime.executeTool`. The tool
mutates **frontend-owned** state and returns a result the model reads.

## 1. Declare it: `src/agent/contract/manifest.ts`

`buildAppMcpManifest()` returns a `Playground3McpManifest`:

```ts
{
  version: 1,
  routeId: APP_PLAYGROUND3_ID,          // = app.config.json id
  tools: [Playground3McpTool, ...],
  skills: [{ id: "add-note", description: "...", scope: "app" }],
}
```

`Playground3McpTool` fields:

| Field | Notes |
| --- | --- |
| `name` | `area.verb`, e.g. `notes.addNote`. Unique. Do not use `web.*`, `browse.*` or `playground3.*`: the host owns those and the iframe refuses them. |
| `description` | Says when to call it and when not to. The model reads this. |
| `inputSchema` | JSON Schema object. Set `required` and `additionalProperties: false`; give each property a `description` and bounds (`minimum`, `maxLength`, …). |
| `resultSchema` | Optional. |
| `promptHint` | An example call, plus what to do on success or retryable failure. |
| `humanApproval` | `{ required: boolean, title?, message?, acceptLabel? }`. When `required: true`, the host's ChatDock shows an approval gate before the call. The mock host does not gate its Call button or `/call`. |

## 2. Wire it in the topology

In each `*.topology.json` that may call it:

- `actions[]`: `{ "actionType": "<name>", "description": "...", "inputJsonSchema": { ... } }`
- `nodes.<id>.task.tools`: add `<name>`
- optional `toolSets.<set>`: groups of names

In `prompts.ts`, add `nodes.<id>.task.tools` with the same list and mention
the tool in the persona. In `agentDefinitions.ts`, add the name to
`capabilities.tools` of every agent allowed to use it.

## 3. Implement it: `src/runtime/tools.ts`

```ts
export const executeAppTool: Playground3ToolHandler<AppState> = ({ toolName, args, state, caller }) => {
  if (toolName === "notes.addNote") {
    // validate args yourself: the model can send anything
    if (bad) {
      return playground3FailToolResult("text must be 1-280 characters.", {
        failureKind: "invalidArgs",
        retryable: true,
        next: "Call notes.addNote again with a shorter, non-empty text.",
      });
    }
    const nextState = /* pure update */;
    return playground3OkToolResult(`Added note "${text}".`, { state: nextState, noteCount });
  }
  return playground3FailToolResult(`Unknown tool: ${toolName}`, { failureKind: "unknownTool", retryable: false });
};
```

- Put the next state at **`data.state`**. On success the SDK applies it,
  saves a checkpoint and returns the serialized state to the host loop.
- Keep handlers pure and synchronous where you can. Async is allowed (return
  a Promise).
- `retryable: true` plus `next` lets the model correct itself. Use
  `retryable: false` for calls that can never succeed.
- `caller` (`agentId`, `nodeId`, `nodeRunId`) is available for audit or
  per-agent rules.
- A read-only tool (e.g. `notes.list`) returns data and no `state`.

## 4. Verify

1. `npm run typecheck`
2. `npm run dev`: the tool appears under **MCP tools** in the mock host.
   Call it with good and bad args. Then try `/call <name> {...}` in the
   composer, which goes through the same `stage.callTool` path the agent uses.
3. Check that the checkpoint panel shows the new state.

## Platform pseudo-tools

These are enabled through agent `capabilities`, not your manifest:
`playground3.askHuman` (`askHuman: true`), `playground3.loadSkill`
(`loadSkills`), `playground3.spawnSubagent` (`spawnSubagents`),
`playground3.switchGraph` (`switchGraph`) and `playground3.planNextSteps`
(`planNextSteps`). Their names are in `PLAYGROUND3_PSEUDO_TOOL_NAMES`.
