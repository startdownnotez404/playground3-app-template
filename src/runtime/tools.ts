import {
  playground3FailToolResult,
  playground3OkToolResult,
  type Playground3ToolHandler,
} from "@startdownnotez404/playground3-stage-sdk";
import { ADD_NOTE_TOOL } from "../agent/contract/manifest";
import { MAX_NOTE_CHARS, MAX_NOTES, type AppState } from "./types";

const newNoteId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const appendNote = (state: AppState, text: string): AppState => ({
  notes: [
    ...state.notes,
    { id: newNoteId(), text, createdAt: new Date().toISOString() },
  ].slice(-MAX_NOTES),
});

/**
 * Runs inside the iframe when the host agent loop calls an MCP tool.
 * Put the next state at `data.state`: on success the SDK applies it, saves a
 * checkpoint, and returns the serialized state to the host loop.
 */
export const executeAppTool: Playground3ToolHandler<AppState> = ({
  toolName,
  args,
  state,
}) => {
  if (toolName !== ADD_NOTE_TOOL) {
    return playground3FailToolResult(`Unknown tool: ${toolName}`, {
      failureKind: "unknownTool",
      retryable: false,
    });
  }

  const text = typeof args?.text === "string" ? args.text.trim() : "";
  if (!text || text.length > MAX_NOTE_CHARS) {
    return playground3FailToolResult(
      `text must be 1-${MAX_NOTE_CHARS} characters.`,
      {
        failureKind: "invalidArgs",
        retryable: true,
        next: "Call notes.addNote again with a shorter, non-empty text.",
      }
    );
  }

  const nextState = appendNote(state, text);
  return playground3OkToolResult(`Added note "${text}".`, {
    noteCount: nextState.notes.length,
    state: nextState,
  });
};
