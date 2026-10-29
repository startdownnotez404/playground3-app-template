#!/usr/bin/env node
/**
 * `npm run check` — validate this app the way Playground Author and the
 * app store (validateStoreAppSource) will, before you zip it. Exit code 1 on
 * any error.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listAppFiles } from "./files.mjs";
import {
  checkStorePackage,
  isKeptInZip,
  STORE_APP_ID_RE,
  STORE_FORBIDDEN_FILES,
  STORE_LIMITS,
  STORE_REQUIRED_ROOT_FILES,
  STORE_SECRET_PATTERNS,
  MAX_ZIP_BYTES,
  parseApiShape,
  parseAppManifest,
  parseMcpAdapter,
  STAGE_SDK_PACKAGE,
  STAGE_SDK_VERSION,
} from "./rules.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];
const read = (name) => {
  const file = path.join(rootDir, name);
  return existsSync(file) ? readFileSync(file, "utf8") : undefined;
};
const attempt = (label, fn) => {
  try {
    return fn();
  } catch (error) {
    errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
};

// 1. app.config.json (+ APIShape.json when secrets are declared)
if (read("playground3.json")?.trim()) {
  errors.push("playground3.json is not used. Rename it to app.config.json.");
}
const configRaw = read("app.config.json");
if (configRaw === undefined) {
  errors.push("app.config.json is missing. Author only lists folders that have one.");
}
const manifest = attempt("app.config.json", () => parseAppManifest(configRaw));
if (manifest) {
  // Backend key rule for playgroundId (playgroundAppRecords.ts PLAYGROUND_ID_RE).
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(manifest.id)) {
    errors.push(
      `app.config.json id "${manifest.id}" is not a valid playgroundId (letters, digits, . _ : -; max 128; must start with a letter or digit).`
    );
  } else if (!STORE_APP_ID_RE.test(manifest.id)) {
    errors.push(
      `app.config.json id "${manifest.id}" must be a lowercase slug: 2-63 chars of a-z, 0-9 and "-", starting with a letter or digit (store rule).`
    );
  }
  if (manifest.fileNameRaw !== manifest.fileName) {
    warnings.push(`app.config.json fileName will be published as "${manifest.fileName}".`);
  }
  for (const key of ["apiKey", "secret", "token", "password"]) {
    if (JSON.stringify(manifest.raw).toLowerCase().includes(`"${key.toLowerCase()}":`)) {
      warnings.push(`app.config.json has a "${key}" field. Secret values never go in app.config.json; declare names in appSecrets.`);
    }
  }
  attempt("APIShape.json", () => parseApiShape(read("APIShape.json"), manifest.secretNames));
}

// 2. mcp.adapter.json (optional, app-owned)
const adapterRaw = read("mcp.adapter.json");
if (adapterRaw !== undefined) {
  attempt("mcp.adapter.json", () => {
    const adapter = parseMcpAdapter(JSON.parse(adapterRaw));
    const url = String(adapter.server.url);
    if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//.test(url)) {
      throw new Error("server.url must be loopback (MCP Connector is http://127.0.0.1:3920/mcp).");
    }
  });
}

// 3. package.json: SDK pin + required scripts
const pkg = attempt("package.json", () => JSON.parse(read("package.json") ?? ""));
if (pkg) {
  const sdk = pkg.dependencies?.[STAGE_SDK_PACKAGE];
  if (sdk !== STAGE_SDK_VERSION) {
    errors.push(
      `package.json must pin ${STAGE_SDK_PACKAGE} to "${STAGE_SDK_VERSION}" (found ${JSON.stringify(sdk ?? null)}). Author installs exactly that npmjs version.`
    );
  }
  if (pkg.dependencies?.["@startdown/playground3-stage-sdk"]) {
    errors.push("Remove the legacy @startdown/playground3-stage-sdk dependency.");
  }
  if (!pkg.scripts?.dev) {
    errors.push('package.json needs a "dev" script (Author runs npm run dev).');
  }
  const lockRaw = read("package-lock.json");
  const lock = lockRaw === undefined ? null : attempt("package-lock.json", () => JSON.parse(lockRaw));
  errors.push(...checkStorePackage(pkg, lockRaw === undefined ? null : lock ?? {}));
}
if (!["vite.config.mjs", "vite.config.ts", "vite.config.js"].some((name) => read(name) !== undefined)) {
  errors.push("Missing vite.config.mjs (or .ts/.js) at the app root.");
} else if (!(read("vite.config.mjs") ?? read("vite.config.ts") ?? read("vite.config.js") ?? "").includes("viteSingleFile")) {
  errors.push("vite.config must use vite-plugin-singlefile. The published app is one HTML file.");
}
if (read("index.html") === undefined) {
  errors.push("index.html is missing.");
}

// 4. What Author will actually receive from a zip of this folder
const files = listAppFiles(rootDir);
const kept = files.filter((file) => isKeptInZip(file.relative));
const dropped = files.filter((file) => !isKeptInZip(file.relative));
const keptBytes = kept.reduce((sum, file) => sum + file.bytes, 0);
if (keptBytes > MAX_ZIP_BYTES) {
  errors.push(`Source files total ${(keptBytes / 1024 / 1024).toFixed(1)} MB. Author rejects zips over 20 MB.`);
}
if (kept.length > STORE_LIMITS.maxFiles) {
  errors.push(`Too many files (${kept.length}; the store allows ${STORE_LIMITS.maxFiles}).`);
}
for (const required of STORE_REQUIRED_ROOT_FILES) {
  if (!kept.some((file) => file.relative === required)) {
    errors.push(`Missing ${required} at the app root (store rule).`);
  }
}
for (const file of files) {
  const base = file.relative.split("/").pop();
  if (STORE_FORBIDDEN_FILES.has(base)) {
    errors.push(`${file.relative} is not allowed; the store installs from the public npm registry only. Delete it.`);
  }
}
for (const file of dropped) {
  if (file.relative.startsWith("src/") || file.relative.startsWith("public/")) {
    errors.push(
      `${file.relative} will be dropped from the zip (allowed: .ts .tsx .js .jsx .mjs .cjs .json .md .css .html .svg .txt .py, .gitignore, .nvmrc, LICENSE). Inline it as a data URL in a .ts file, or use .svg.`
    );
  }
}
if (files.some((file) => file.relative.startsWith("vendor/"))) {
  errors.push("vendor/ is not allowed. Install the Stage SDK from npm.");
}
for (const file of kept) {
  if (file.bytes > STORE_LIMITS.maxFileBytes) {
    errors.push(`${file.relative} is larger than 2 MB (store rule).`);
  }
  if (file.relative !== "package-lock.json") {
    const text = readFileSync(file.absolute, "utf8");
    for (const [kind, pattern] of STORE_SECRET_PATTERNS) {
      if (pattern.test(text)) {
        errors.push(`${file.relative} looks like it contains a ${kind}. Declare it as an app secret instead of shipping it.`);
      }
    }
  }
}
if (keptBytes > STORE_LIMITS.maxTotalBytes) {
  errors.push("Source is larger than 50 MB (store rule).");
}
for (const file of kept) {
  if (!/\.(tsx?|jsx?|mjs|cjs)$/.test(file.relative) || file.relative.startsWith("scripts/")) {
    continue;
  }
  const source = readFileSync(file.absolute, "utf8");
  if (/from\s+["']@\/(shared\/playground3\/(agent|executor|contracts)|src\/features\/playground3\/executor)/.test(source)) {
    errors.push(`${file.relative} imports platform agent sources. Import from ${STAGE_SDK_PACKAGE} instead.`);
  }
  if (/VITE_[A-Z0-9_]*(KEY|SECRET|TOKEN)/.test(source)) {
    warnings.push(`${file.relative} reads a VITE_*KEY/SECRET/TOKEN env var. That value would ship inside the HTML; use appSecrets + APIShape.json.`);
  }
}

// Report
const label = manifest ? `${manifest.id} (${manifest.fileName})` : "app";
for (const warning of warnings) {
  console.warn(`warn  ${warning}`);
}
for (const error of errors) {
  console.error(`error ${error}`);
}
if (errors.length > 0) {
  console.error(`\n✗ ${label}: ${errors.length} error(s), ${warnings.length} warning(s).`);
  process.exit(1);
}
console.log(
  `✓ ${label}: app.config.json valid` +
    `${manifest?.secretNames.length ? `, ${manifest.secretNames.length} secret(s) + APIShape.json` : ""}` +
    `${manifest?.appRecords.length ? `, ${manifest.appRecords.length} record kind(s)` : ""}` +
    `${adapterRaw !== undefined ? ", mcp.adapter.json" : ""}` +
    `; ${kept.length} files / ${(keptBytes / 1024).toFixed(0)} KB go in the zip` +
    `${warnings.length ? ` (${warnings.length} warning(s))` : ""}.`
);
