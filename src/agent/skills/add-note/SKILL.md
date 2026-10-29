---
name: add-note
description: Use when turning the human's request into one or more notes.
---

# Add note

1. Split the request into separate items, one note each.
2. Call `notes.addNote` once per item with `{"text": "..."}`.
3. On a retryable failure, shorten the text and retry once.
4. Confirm what you added in one short sentence.
