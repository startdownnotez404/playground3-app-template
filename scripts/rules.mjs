/**
 * Validation rules ported from the Playground3 host so `npm run check` fails
 * the same way Author / the submit worker will. Keep in sync with:
 * - apps/web/src/features/playground3/runtime/stage/playground3AppManifest.ts
 * - apps/web/shared/playground3/{appSecrets,scopedSecrets,appRecords,apiShape}.ts
 * - apps/web/shared/playground3/mcp/adapter.ts
 * - apps/web/src/features/playground3/runtime/stage/playground3AuthorOverlay.ts
 *   (zip extension allowlist, skipped dirs, SDK pin)
 * - apps/web/shared/playground3/storeAppValidation.ts (validateStoreAppSource:
 *   store submission rules). Once that file is on the template's base branch,
 *   import it instead of mirroring it here.
 */

export const STAGE_SDK_PACKAGE = "@startdownnotez404/playground3-stage-sdk";
export const STAGE_SDK_VERSION = "0.1.10";
export const MAX_ZIP_BYTES = 20 * 1024 * 1024;

export const ZIP_TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".css",
  ".html",
  ".svg",
  ".txt",
  ".py",
]);

export const ZIP_SKIP_DIR_NAMES = new Set(["node_modules", ".git", "dist", "__MACOSX"]);

export const fileExtension = (filePath) => {
  const base = filePath.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot).toLowerCase() : "";
};

/** Same filter Author applies when it unpacks a zip (packPlayground3ZipInBrowser). */
export const isKeptByAuthor = (relativePath) => {
  const parts = relativePath.split("/");
  if (parts.some((part) => ZIP_SKIP_DIR_NAMES.has(part))) {
    return false;
  }
  return ZIP_TEXT_EXTENSIONS.has(fileExtension(relativePath));
};

// ── App store submission (apps/web/shared/playground3/storeAppValidation.ts) ──

/** Extensionless files the store accepts besides ZIP_TEXT_EXTENSIONS. */
export const STORE_ALLOWED_BARE_FILES = new Set([".gitignore", ".nvmrc", "LICENSE"]);
/** Files that change how npm resolves packages; the store rejects them. */
export const STORE_FORBIDDEN_FILES = new Set([".npmrc", ".yarnrc", ".yarnrc.yml", ".pnpmfile.cjs"]);
export const STORE_REQUIRED_ROOT_FILES = ["app.config.json", "package.json", "package-lock.json", "index.html"];
export const STORE_LIMITS = {
  maxFiles: 2_000,
  maxFileBytes: 2 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
};
export const STORE_APP_ID_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;
export const STORE_ALLOWED_DEPENDENCIES = new Set([
  "@emotion/react",
  "@emotion/styled",
  "@mui/icons-material",
  "@mui/material",
  "@startdownnotez404/playground3-stage-sdk",
  "@startdownnotez404/ui",
  "@types/react",
  "@types/react-dom",
  "@vitejs/plugin-react",
  "attr-accept",
  "base64-js",
  "buffer",
  "chess.js",
  "ieee754",
  "react",
  "react-dom",
  "react-icons",
  "typescript",
  "vite",
  "vite-plugin-singlefile",
]);
export const STORE_LIFECYCLE_SCRIPTS = ["preinstall", "install", "postinstall", "prepare", "prepack", "postpack"];
export const STORE_SECRET_PATTERNS = [
  ["AWS access key id", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ["OpenAI key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
  ["Anthropic key", /\bsk-ant-[A-Za-z0-9_-]{32,}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ["Private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];

const storeExtension = (relativePath) => {
  const base = relativePath.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot).toLowerCase() : "";
};

/** Store file-type rule: allowlisted extension or bare file, not a forbidden npm config. */
export const isStoreAllowedFile = (relativePath) => {
  const base = relativePath.split("/").pop() ?? "";
  if (STORE_FORBIDDEN_FILES.has(base)) {
    return false;
  }
  return ZIP_TEXT_EXTENSIONS.has(storeExtension(relativePath)) || STORE_ALLOWED_BARE_FILES.has(base);
};

/** What `npm run zip` packs: skipped dirs out, then the store file-type rule. */
export const isKeptInZip = (relativePath) => {
  const parts = relativePath.split("/");
  if (parts.some((part) => ZIP_SKIP_DIR_NAMES.has(part))) {
    return false;
  }
  return isStoreAllowedFile(relativePath);
};

/** validateStoreAppSource package.json + lockfile rules. Returns error strings. */
export const checkStorePackage = (pkg, lock) => {
  const errors = [];
  const scripts = pkg?.scripts ?? {};
  if (typeof scripts.build !== "string" || !/^vite build(\s|$)/.test(scripts.build.trim())) {
    errors.push('package.json "build" script must be "vite build".');
  }
  for (const name of STORE_LIFECYCLE_SCRIPTS) {
    if (name in scripts) {
      errors.push(`package.json must not define a "${name}" script.`);
    }
  }
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    for (const [name, spec] of Object.entries(pkg?.[field] ?? {})) {
      if (!STORE_ALLOWED_DEPENDENCIES.has(name)) {
        errors.push(`Dependency "${name}" is not on the store allowlist. Ask to have it added, or remove it.`);
      }
      if (typeof spec !== "string" || /[:/]/.test(spec)) {
        errors.push(`Dependency "${name}" must use an npm version range, not "${String(spec)}".`);
      }
    }
  }
  if (!lock) {
    return errors; // missing lockfile is reported with the other required root files
  }
  if (typeof lock.lockfileVersion !== "number" || lock.lockfileVersion < 2) {
    errors.push("package-lock.json must be lockfileVersion 2 or 3 (npm 7+).");
    return errors;
  }
  for (const [entryPath, entry] of Object.entries(lock.packages ?? {})) {
    if (!entryPath || entry.link === true) {
      continue;
    }
    if (typeof entry.resolved !== "string" || !entry.resolved.startsWith("https://registry.npmjs.org/")) {
      errors.push(`package-lock.json resolves ${entryPath} outside registry.npmjs.org. Regenerate the lockfile against the public npm registry.`);
      break;
    }
    if (typeof entry.integrity !== "string") {
      errors.push(`package-lock.json has no integrity hash for ${entryPath}.`);
      break;
    }
  }
  return errors;
};

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

// ── app.config.json ─────────────────────────────────────────────────────────

const NAME_RE = /^[A-Z][A-Z0-9_]{1,63}$/;

const requireSecretName = (name) => {
  const trimmed = name.trim();
  if (!NAME_RE.test(trimmed)) {
    throw new Error("Secret name must be SCREAMING_SNAKE, 2–64 characters (A–Z, 0–9, _).");
  }
  return trimmed;
};

const parseSecretList = (value, field, { scoped }) => {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }
  const seen = new Set();
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`${field}[${index}] must be an object.`);
    }
    const name = requireSecretName(typeof entry.name === "string" ? entry.name : "");
    if (seen.has(name)) {
      throw new Error(`${field} lists ${name} more than once.`);
    }
    seen.add(name);
    if (scoped) {
      const scope = typeof entry.scope === "string" ? entry.scope.trim() : "";
      if (scope !== "author" && scope !== "player") {
        throw new Error("Secret scope must be author or player.");
      }
    }
    return { name };
  });
};

const parseRecordKinds = (value) => {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("appRecords must be an array.");
  }
  const seen = new Set();
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`appRecords[${index}] must be an object.`);
    }
    const kind = typeof entry.kind === "string" ? entry.kind.trim() : "";
    if (!NAME_RE.test(kind)) {
      throw new Error("Record kind must be SCREAMING_SNAKE, 2–64 characters (A–Z, 0–9, _).");
    }
    if (seen.has(kind)) {
      throw new Error(`appRecords lists ${kind} more than once.`);
    }
    seen.add(kind);
    return { kind };
  });
};

/** parsePlayground3AppManifest, without the fallback the host derives from a folder name. */
export const parseAppManifest = (raw) => {
  let parsed = {};
  if (raw?.trim()) {
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error("app.config.json is not valid JSON.");
    }
    if (isRecord(value)) {
      parsed = value;
    }
  }
  const id = (typeof parsed.id === "string" && parsed.id.trim()) || "";
  if (!id) {
    throw new Error("app.config.json must include an id (used as StageBridge playgroundId).");
  }
  const fileNameRaw =
    (typeof parsed.fileName === "string" && parsed.fileName.trim()) || `${id}.html`;
  const fileName = fileNameRaw.endsWith(".html") ? fileNameRaw : `${fileNameRaw}.html`;
  const appSecrets = parseSecretList(parsed.appSecrets, "appSecrets", { scoped: false });
  const scopedSecrets = parseSecretList(parsed.scopedSecrets, "scopedSecrets", { scoped: true });
  const names = new Set();
  for (const entry of [...appSecrets, ...scopedSecrets]) {
    if (names.has(entry.name)) {
      throw new Error(`${entry.name} cannot be both an app secret and a scoped secret.`);
    }
    names.add(entry.name);
  }
  const appRecords = parseRecordKinds(parsed.appRecords);
  return {
    id,
    title: (typeof parsed.title === "string" && parsed.title.trim()) || id,
    fileName,
    fileNameRaw,
    secretNames: [...names],
    appRecords,
    raw: parsed,
  };
};

// ── APIShape.json ───────────────────────────────────────────────────────────

const SECRET_TEMPLATE = /\{\{secret\.([A-Z][A-Z0-9_]{1,63})\}\}/g;
const CALL_ID_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_SHAPE_CHARS = 65_536;
const MAX_CALLS = 64;
const MAX_HOSTS = 64;
const MAX_PATH = 2_048;
const MAX_HOST = 253;

const collectSecretNames = (value, into = new Set()) => {
  if (typeof value === "string") {
    for (const match of value.matchAll(SECRET_TEMPLATE)) {
      into.add(match[1] ?? "");
    }
  } else if (Array.isArray(value)) {
    value.forEach((entry) => collectSecretNames(entry, into));
  } else if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new Error("Request body does not match the API shape.");
      }
      collectSecretNames(entry, into);
    }
  }
  return into;
};

const asHostname = (value) => {
  const host = value.trim().toLowerCase();
  if (!host || host.length > MAX_HOST || host.includes(":") || host.includes("/") || host.endsWith(".")) {
    throw new Error("Host is not allowlisted.");
  }
  return host;
};

const parseCall = (value, index) => {
  if (!isRecord(value)) {
    throw new Error(`APIShape calls[${index}] must be an object.`);
  }
  if ("payload" in value) {
    throw new Error("APIShape must not declare a payload bucket.");
  }
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!CALL_ID_RE.test(id)) {
    throw new Error(`APIShape calls[${index}].id is not valid.`);
  }
  const method = typeof value.method === "string" ? value.method.trim().toUpperCase() : "";
  if (!METHODS.has(method)) {
    throw new Error(`APIShape calls[${index}].method is not valid.`);
  }
  if (value.probe === true && method !== "GET") {
    throw new Error(`APIShape calls[${index}] probe must be GET.`);
  }
  const url = typeof value.url === "string" ? value.url.trim() : "";
  const path = typeof value.path === "string" ? value.path.trim() : "";
  if (path.length > MAX_PATH) {
    throw new Error(`APIShape calls[${index}].path is too long.`);
  }
  let hosts;
  if (value.hosts != null) {
    if (!Array.isArray(value.hosts) || value.hosts.length === 0 || value.hosts.length > MAX_HOSTS) {
      throw new Error("APIShape hosts must be a non-empty list.");
    }
    hosts = value.hosts.map((entry) => asHostname(String(entry)));
  }
  if (url) {
    if (!url.includes("{{secret.")) {
      throw new Error(`APIShape calls[${index}].url must be a {{secret.NAME}} template.`);
    }
  } else {
    if (!path) {
      throw new Error(`APIShape calls[${index}] needs path or url.`);
    }
    if (!hosts?.length) {
      throw new Error(`APIShape calls[${index}] needs hosts.`);
    }
  }
  for (const field of ["headers", "query", "body"]) {
    if (value[field] != null && !isRecord(value[field])) {
      throw new Error(`APIShape ${field} must be an object.`);
    }
  }
  return { id, probe: value.probe === true, value };
};

/** parsePlayground3PackedApiShape + parsePlayground3ApiShape. */
export const parseApiShape = (raw, secretNames) => {
  if (!raw?.trim()) {
    if (secretNames.length > 0) {
      throw new Error("APIShape.json is required when app.config.json lists appSecrets or scopedSecrets.");
    }
    return undefined;
  }
  const text = raw.trim();
  if (text.length > MAX_SHAPE_CHARS) {
    throw new Error("APIShape.json is too large.");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("APIShape.json is not valid JSON.");
  }
  const callsRaw = Array.isArray(parsed) ? parsed : isRecord(parsed) ? parsed.calls : undefined;
  if (!Array.isArray(callsRaw)) {
    throw new Error("APIShape.json must have a calls array.");
  }
  if (callsRaw.length === 0) {
    throw new Error("APIShape.json must list at least one call.");
  }
  if (callsRaw.length > MAX_CALLS) {
    throw new Error("APIShape.json has too many calls.");
  }
  const allowed = new Set(secretNames);
  const seen = new Set();
  return callsRaw.map((entry, index) => {
    const call = parseCall(entry, index);
    if (seen.has(call.id)) {
      throw new Error(`APIShape lists ${call.id} more than once.`);
    }
    seen.add(call.id);
    const used = collectSecretNames(call.value);
    for (const name of used) {
      if (!name || !allowed.has(name)) {
        throw new Error(
          `APIShape {{secret.${name || "NAME"}}} is not listed in app.config.json appSecrets or scopedSecrets.`
        );
      }
    }
    if (used.size === 0) {
      throw new Error(`APIShape call ${call.id} must use a {{secret.NAME}} template.`);
    }
    return call;
  });
};

// ── mcp.adapter.json ────────────────────────────────────────────────────────

const parseString = (value) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

/** normalizePlayground3McpAdapterDocument (structural checks only). */
export const parseMcpAdapter = (value) => {
  if (!isRecord(value)) {
    throw new Error("Playground3 MCP adapter must be an object.");
  }
  if (value.version !== 1) {
    throw new Error("Playground3 MCP adapter version must be 1.");
  }
  if (!parseString(value.id) || !parseString(value.name)) {
    throw new Error("Playground3 MCP adapter requires id and name.");
  }
  if (!isRecord(value.server)) {
    throw new Error("Playground3 MCP adapter requires server.");
  }
  const transport = value.server.transport;
  if (transport !== "streamable-http" && transport !== "sse") {
    throw new Error('Playground3 MCP adapter server.transport must be "streamable-http" or "sse".');
  }
  if (!parseString(value.server.url)) {
    throw new Error("Playground3 MCP adapter server.url is required.");
  }
  const parseNames = (names) => {
    if (names == null) {
      return [];
    }
    if (!Array.isArray(names) || names.some((entry) => typeof entry !== "string")) {
      throw new Error("Playground3 MCP adapter requires must be an array of strings.");
    }
    return names.map((entry) => entry.trim()).filter(Boolean);
  };
  parseNames(value.requires);
  if (value.proposals != null) {
    if (!Array.isArray(value.proposals)) {
      throw new Error("Playground3 MCP adapter proposals must be an array.");
    }
    value.proposals.forEach((proposal, index) => {
      if (!isRecord(proposal) || !isRecord(proposal.spec)) {
        throw new Error(`Playground3 MCP adapter proposals[${index}] needs a spec object.`);
      }
      if (parseNames(proposal.provides).length === 0) {
        throw new Error(`Playground3 MCP adapter proposals[${index}] needs provides.`);
      }
    });
  }
  // discovery other than "catalog" | "live" falls back to "live" on the host.
  return value;
};
