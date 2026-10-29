---
name: package-and-submit
description: Package this Playground3 app and load it in Playground Author (zip rules, what Author rewrites, WebContainer build). Use before handing off, when Author rejects or fails to build the app, or when preparing a submission.
---

# Package and submit

## Pre-flight

```bash
npm run check       # host validators + zip contents; must print ✓
npm run typecheck
npm run build       # dist/index.html, one file
# optional: npm run dev → /dev/host.html?bundle=dist/index.html
npm run zip         # writes <id>.zip
```

## Getting the app into Author

On `/playground3/author`, either:

- **Load zip**: upload `<id>.zip` (from `npm run zip`, or a zip of the
  folder or of a repo with one folder per app), or
- **GitHub URL**: paste the repo URL. Author lists every folder with an
  `app.config.json`. Private repos need a PAT with Contents: Read in the
  token field.

Author mounts the files in a WebContainer, runs `npm install` and
`npm run dev` for the preview, and runs `npm run build` to compile the
single HTML file that gets published. The Submit step, which is being
built, sends this same source zip, and the server rebuilds it from
source. Anything that builds here is what will be built there.

## Zip rules

From `packPlayground3ZipInBrowser.ts`, `buildPlayground3AuthorWorkspace.ts`,
`playground3ZipEntries.ts` and `playground3AuthorOverlay.ts`:

| Rule | Value |
| --- | --- |
| Max zip size | **20 MB** ("Zip file is larger than 20 MB.") |
| Kept extensions | `.ts .tsx .js .jsx .mjs .cjs .json .md .css .html .svg .txt .py`. Every other file is **silently dropped**, including `.png`, `.jpg`, fonts, `.wasm` and `.env*` (and, in Author only, `.gitignore`/`.nvmrc`). |
| Skipped dirs | `node_modules`, `.git`, `dist`, `__MACOSX` (and `.DS_Store`) |
| Paths | No absolute paths and no `..`. Zip64 is not supported. Only stored or deflate entries. |
| Root folder | A single top-level folder is stripped, so zipping `my-app/` or its contents both work. |
| App discovery | `app.config.json` at the root, or one or two folders deep (catalog zips). |

`npm run zip` applies these filters plus the store's file-type rule (below),
so the zip contains what both Author and the store accept. `npm run check` fails when a file under `src/` or `public/` would be
dropped. Inline binary assets as data URLs in a `.ts` file, or use SVG.

## App store rules (submission)

The server checks the same source zip with `validateStoreAppSource`
(`apps/web/shared/playground3/storeAppValidation.ts`) before it builds
anything. `npm run check` mirrors these rules:

- **At the zip root** (or under one wrapping folder): `app.config.json`,
  `package.json`, **`package-lock.json`**, `index.html` and
  `vite.config.mjs|ts|js`. Commit the lockfile. Unlike Author, the store
  needs it.
- **Lockfile**: `lockfileVersion` 2 or 3, and every package `resolved` from
  `https://registry.npmjs.org/` with an `integrity` hash. Regenerate it
  with the default registry if it is not.
- **`package.json`**: `build` must be `vite build`. No `preinstall`,
  `install`, `postinstall`, `prepare`, `prepack` or `postpack` scripts.
- **Direct dependencies** (all of `dependencies`, `devDependencies` and
  `optionalDependencies`) must be on the allowlist: `@emotion/react`,
  `@emotion/styled`, `@mui/icons-material`, `@mui/material`,
  `@startdownnotez404/playground3-stage-sdk`, `@startdownnotez404/ui`,
  `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`,
  `attr-accept`, `base64-js`, `buffer`, `chess.js`, `ieee754`, `react`,
  `react-dom`, `react-icons`, `typescript`, `vite` and
  `vite-plugin-singlefile`. Specs must be npm ranges: no `git:`, `github:`,
  `file:` or URLs. To add a package, ask for it to be allowlisted.
- **File types**: the Author list plus `.gitignore`, `.nvmrc` and `LICENSE`.
  `.npmrc`, `.yarnrc`, `.yarnrc.yml` and `.pnpmfile.cjs` are **rejected**,
  as are `node_modules/`, `dist/`, `.git/` and `__MACOSX/` inside the zip.
  This is why the env sample is named `env.example.txt`.
- **Limits**: at most 2,000 files, 2 MB per file and 50 MB unzipped.
- **`app.config.json` `id`**: a lowercase slug of 2–63 characters
  (`^[a-z0-9][a-z0-9-]{1,62}$`). It must **equal the store app id** you
  submit under, because secrets and records are keyed by it.
- **Credential-looking strings** are rejected anywhere except the
  lockfile: AWS `AKIA…`/`ASIA…`, GitHub `ghp_…`, `sk-…`, `sk-ant-…`, Google
  `AIza…`, Slack `xox…-` and PEM private keys.

## What Author rewrites (do not fight it)

`applyPlayground3AuthorOverlay` runs on every upload:

- **package.json**: pins `@startdownnotez404/playground3-stage-sdk` to
  `0.1.10`, adds
  `@startdownnotez404/ui` if it is missing, and adds the CJS shim deps
  (`attr-accept`, `base64-js`, `buffer`, `ieee754`). A fallback
  `package.json` is generated if none exists.
- **Lockfiles are deleted** in the Author sandbox (`package-lock.json`,
  `npm-shrinkwrap.json`, `yarn.lock`, `pnpm-lock.yaml`), which installs from
  your `package.json` ranges. Keep the ranges valid on their own, and still
  commit `package-lock.json`, because the store requires it.
- **vite.config**: Author rewrites it by text pattern. It adds `dedupe`,
  `optimizeDeps` (`include` React + CJS shims, `exclude` the SDK,
  `noDiscovery: true`, `holdUntilCrawlEnd: false`) and
  `server.preTransformRequests: false`, and
  injects two serve-only plugins. Keep the template's shape: a literal
  `optimizeDeps: { exclude: ["@startdownnotez404/playground3-stage-sdk"] }`,
  and no computed config objects. A fallback config is generated if none
  exists.
- **index.html**: Author injects the appearance bootstrap, a transparent
  canvas, a loading placeholder and a module boot script.
- **Imports** are not rewritten. Import `Markdown`, `FlowMap` and
  `JsonEditor` from their `@startdownnotez404/ui/…` subpaths yourself.

The dev host plugin (`dev/devHostPlugin.mjs`) does nothing in the
WebContainer: it detects `process.versions.webcontainer` and skips both its
optimizeDeps tweak and opening the browser.

## When Author fails

| Symptom | Fix |
| --- | --- |
| "No app.config.json found in this zip" | The zip root or the first two folder levels need `app.config.json`. |
| "app.config.json must include an id" | Add `id`. |
| "APIShape.json is required when app.config.json lists appSecrets…" | Add `APIShape.json` at the app root. Its `.json` extension is kept. |
| "Slim author workspace missing … (0.1.10)" | Set the SDK dependency to exactly `"0.1.10"`. |
| "Slim author workspace must not mount platform agent sources" | Remove copied `shared/playground3/agent|executor|contracts` files. |
| Preview is blank or stuck on Rendering | Check the WebContainer console. Usually it is a runtime error in `main.tsx` or `Shell`. Reproduce with `npm run dev` and `?bundle=dist/index.html`. |
| A missing image or font | It was dropped by the extension filter. Inline it. |
