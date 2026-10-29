import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { Playground3UiProps } from "@startdownnotez404/playground3-stage-sdk";
import { hasStageBridgeHost, listAppRecords, putAppRecord } from "../host/stageBridge";
import { appendNote } from "../runtime/tools";
import { MAX_NOTE_CHARS, type AppState } from "../runtime/types";

const NOTE_RECORD_KIND = "NOTE";
const NOTE_RECORD_ID = "latest";

const formatError = (error: unknown): string =>
  error instanceof Error && error.message.trim() ? error.message : "Request failed.";

export default function AppShell({
  state,
  setState,
  actions,
  isRunning,
  status,
  error,
}: Playground3UiProps<AppState>) {
  const [draft, setDraft] = useState("");
  const [recordStatus, setRecordStatus] = useState<string | null>(null);
  const hosted = hasStageBridgeHost();

  const addLocalNote = () => {
    const text = draft.trim().slice(0, MAX_NOTE_CHARS);
    if (!text) {
      return;
    }
    const next = appendNote(state, text);
    setState(next);
    void actions.persistCheckpoint(next, "user");
    setDraft("");
  };

  // App records outlive the session checkpoint (per user, per app, ≤16 KB).
  const saveToRecords = async () => {
    try {
      const row = await putAppRecord({
        kind: NOTE_RECORD_KIND,
        id: NOTE_RECORD_ID,
        payload: { notes: state.notes },
      });
      setRecordStatus(`Saved ${state.notes.length} notes (${row.bytes} bytes).`);
    } catch (nextError) {
      setRecordStatus(formatError(nextError));
    }
  };

  const loadFromRecords = async () => {
    try {
      const rows = await listAppRecords(NOTE_RECORD_KIND);
      const payload = rows.find((row) => row.id === NOTE_RECORD_ID)?.payload as
        | Partial<AppState>
        | undefined;
      const notes = Array.isArray(payload?.notes) ? payload.notes : [];
      const next = { notes };
      setState(next);
      void actions.persistCheckpoint(next, "user");
      setRecordStatus(`Loaded ${notes.length} notes.`);
    } catch (nextError) {
      setRecordStatus(formatError(nextError));
    }
  };

  return (
    <Box sx={{ p: 2, height: "100%", boxSizing: "border-box", overflow: "auto" }}>
      <Stack spacing={2} sx={{ maxWidth: 560, mx: "auto" }}>
        <Typography variant="h6">Notes</Typography>
        <Typography variant="body2" color="text.secondary">
          Ask the assistant to add a note, or type one here.
        </Typography>

        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            fullWidth
            placeholder="New note"
            value={draft}
            inputProps={{ maxLength: MAX_NOTE_CHARS }}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                addLocalNote();
              }
            }}
          />
          <Button variant="contained" onClick={addLocalNote} disabled={!draft.trim()}>
            Add
          </Button>
        </Stack>

        <Stack component="ul" spacing={0.5} sx={{ pl: 2, m: 0 }} data-testid="notes">
          {state.notes.length === 0 ? (
            <Typography component="li" variant="body2" color="text.secondary">
              No notes yet.
            </Typography>
          ) : (
            state.notes.map((note) => (
              <Typography component="li" variant="body2" key={note.id}>
                {note.text}
              </Typography>
            ))
          )}
        </Stack>

        <Stack direction="row" spacing={1}>
          <Button size="small" onClick={saveToRecords} disabled={!hosted}>
            Save to records
          </Button>
          <Button size="small" onClick={loadFromRecords} disabled={!hosted}>
            Load from records
          </Button>
        </Stack>

        <Typography variant="caption" color="text.secondary">
          {isRunning ? "Assistant is working…" : recordStatus || status || ""}
        </Typography>
        {error ? (
          <Typography variant="caption" color="error">
            {error}
          </Typography>
        ) : null}
      </Stack>
    </Box>
  );
}
