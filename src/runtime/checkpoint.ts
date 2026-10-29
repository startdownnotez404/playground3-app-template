import type { Playground3CheckpointAdapter } from "@startdownnotez404/playground3-stage-sdk";
import { MAX_NOTES, type AppNote, type AppState } from "./types";

const isNote = (value: unknown): value is AppNote =>
  Boolean(value) &&
  typeof value === "object" &&
  typeof (value as AppNote).id === "string" &&
  typeof (value as AppNote).text === "string";

export const appCheckpoint: Playground3CheckpointAdapter<AppState> = {
  createInitial: () => ({ notes: [] }),
  serialize: (state) => JSON.stringify({ notes: state.notes }),
  parse: (json) => {
    try {
      const parsed = JSON.parse(json) as { notes?: unknown };
      const notes = Array.isArray(parsed?.notes)
        ? parsed.notes.filter(isNote).slice(-MAX_NOTES)
        : [];
      return { notes };
    } catch {
      return { notes: [] };
    }
  },
};

/** Compact view the prompt sees as checkpoint state. Keep it small. */
export const buildAppCheckpointPromptView = (state: AppState) => ({
  noteCount: state.notes.length,
  notes: state.notes.map((note) => note.text),
});
