---
name: secrets-and-records
description: Per-app API keys (appSecrets / scopedSecrets + APIShape.json third-party calls) and per-app saved rows (appRecords). Use when the app needs a vendor API key, calls a third-party HTTP API, or must remember data across sessions.
---

# Secrets and records

Both are backend features, and the **host** binds them to the running app.
The iframe never chooses which app's data it reads. The host stamps
`playgroundId` from the session, not from the iframe, and rejects requests
that send one. Call both through `src/host/stageBridge.ts`.

## API keys (app secrets)

Keys are **backend secrets**: one Dynamo row per
`(owner, playgroundId, name)`, encrypted with KMS. An app can read only its
own rows. Browser code and GraphQL never see the ciphertext; metadata such
as `last4` is fine.

**Never** put a key value in `app.config.json`, `APIShape.json`, source, a
`VITE_*` env var, or the built HTML. The user pastes the key in ChatDock.

### 1. Declare names: `app.config.json`

```json
"appSecrets": [
  { "name": "OPENWEATHER_API_KEY", "label": "OpenWeather API key", "required": true,
    "helperText": "From openweathermap.org → API keys." }
]
```

- `name`: SCREAMING_SNAKE, 2–64 characters (`^[A-Z][A-Z0-9_]{1,63}$`),
  unique. `label` defaults to the name. A `required` key blocks work until
  it is set.
- `scopedSecrets`: the same fields plus a required `scope`
  (`"author"` | `"player"`), stored separately. The host stamps the scope;
  the iframe never sends it. A name cannot appear in both lists.

### 2. Declare calls: `APIShape.json` (required once any secret is declared)

Start from `samples/APIShape.json`. Each call has:

- `id`: the action name the app sends (`^[a-zA-Z][a-zA-Z0-9_]{0,63}$`)
- `method`: `GET`/`POST`/`PUT`/`PATCH`/`DELETE`
- either `hosts` (bare hostnames, no scheme, port or path) plus `path`
  (`*` matches one segment), **or** a `url` that is itself a
  `{{secret.NAME}}` template (for example a webhook URL)
- `headers` / `query` / `body` holding `{{secret.NAME}}` templates. Every
  call must use at least one, and each NAME must be declared.
- `probe: true` (GET only) marks the call ChatDock's **Test** button uses.
  Test never returns the body, and the app cannot invoke a probe call.
- No `payload` key. 1–64 calls, 64 KB max.

### 3. Call from the app

```ts
const res = await callAppThirdPartyAPI({
  name: "OPENWEATHER_API_KEY",     // which key
  action: "currentWeather",        // APIShape call id
  params: { query: { q: "London" } },   // host, path, query, headers, body
});
// res: { ok, httpStatus, message, payload }
```

- The iframe sends only `{ name, action, paramsJson }`. Never `url`,
  `shapeJson`, `scope`, `playgroundId` or a key.
- The host merges the shape (shape values win), injects the secret,
  checks host and path against the allowlist, and fetches. It returns the
  vendor body **as-is**, with any injected secret redacted to
  `{{secret.NAME}}`. Shape vendor data in your app, not in the request.
- Optional multipart: `params.files: [{ field, filename, type, data(base64) }]`,
  images (png/jpeg/gif/webp) and video (mp4/webm/mov) only, at most 10
  parts and about 480 KB total. `formJsonField` names the JSON part.
- `getAppSecretMeta(name)` returns `{ last4, updatedAt }` or null.
  `requestAppSecret(name)` asks the host to prompt the user. The app cannot
  set or upsert a key.

### Local dev

Put `PG3_SECRET_OPENWEATHER_API_KEY=…` in `.env.local` (git-ignored; see
`env.example.txt`) and restart `npm run dev`. The Vite process plays the
backend: the value never reaches the browser, and the mock host shows only
`last4`.

## App records (saved rows)

Use app records for facts that last per user, per app (a log, saved
items, settings). Do not use them for the live board, which is the
checkpoint, or for secrets.

- One Dynamo row per `(owner, playgroundId, kind, id)`. Small JSON only:
  **16 KB max** per row. Bigger payloads are rejected and never spill to S3.
- Backend limits (`packages/backend/amplify/usage/playgroundAppRecords.ts`):
  at most 500 rows per app and 100 writes per hour. `id` must match
  `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$` (no `#`). Omit `id` to get a UUID.
  Writing an existing `id` overwrites it.
- Declare every `kind` in `app.config.json`. The iframe cannot invent kinds.

```json
"appRecords": [{ "kind": "NOTE", "label": "Saved note" }]
```

Kinds are SCREAMING_SNAKE, 2–64 characters, unique.

```ts
await putAppRecord({ kind: "NOTE", id: "latest", payload: { notes } }); // id optional
await listAppRecords("NOTE");          // AppRecord[] { kind, id, payload, bytes, createdAt }
await getAppRecord("NOTE", "latest");  // AppRecord | null
await deleteAppRecord("NOTE", "latest");
```

The mock host stores rows in `localStorage` and enforces the declared kinds
and the 16 KB limit.

## Checklist

- [ ] Names in `app.config.json` match the `{{secret.NAME}}` in `APIShape.json`
- [ ] No key values in the repo (`npm run check` warns about `VITE_*KEY` use)
- [ ] Every record `kind` used in code is declared in `appRecords`
- [ ] `npm run check` passes
