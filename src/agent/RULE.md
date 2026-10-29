# App rules

This app keeps a short list of notes. The frontend owns the list; the agent
changes it only through `notes.addNote`.

- The checkpoint `notes` array is the only source of truth.
- One note per tool call. At most 280 characters per note.
- Never invent notes the human did not ask for.
