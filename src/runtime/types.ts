export type AppNote = {
  id: string;
  text: string;
  createdAt: string;
};

/** Frontend-owned state. The checkpoint adapter serializes this for the host. */
export type AppState = {
  notes: AppNote[];
};

export const MAX_NOTES = 50;
export const MAX_NOTE_CHARS = 280;
