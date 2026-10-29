import type { Playground3McpManifest } from "@startdownnotez404/playground3-stage-sdk";
import appConfig from "../../../app.config.json";

/** Single source of truth: app.config.json `id` is the StageBridge playgroundId. */
export const APP_PLAYGROUND3_ID: string = appConfig.id;

export const ADD_NOTE_TOOL = "notes.addNote";

/**
 * MCP tool catalog the host agent loop sees. Every name here must be handled
 * by `executeAppTool` (src/runtime/tools.ts) and listed in the topology
 * `actions` / node `task.tools` that may call it.
 */
export const buildAppMcpManifest = (): Playground3McpManifest => ({
  version: 1,
  routeId: APP_PLAYGROUND3_ID,
  tools: [
    {
      name: ADD_NOTE_TOOL,
      description:
        "Append one short note to the frontend-owned note list. Use when the human asks you to remember, jot down, or add something.",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Note text, one line, at most 280 characters.",
            minLength: 1,
            maxLength: 280,
          },
        },
        required: ["text"],
        additionalProperties: false,
      },
      promptHint:
        'Example: {"text":"Buy oat milk"}. On success, confirm the note in plain language. ' +
        "On Error:/Next: with retryable:true, shorten or fix the text and call again once.",
      humanApproval: {
        required: false,
      },
    },
  ],
  skills: [
    {
      id: "add-note",
      description: "Use when turning the human's request into one or more notes.",
      scope: "app",
    },
  ],
});
