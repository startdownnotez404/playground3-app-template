/**
 * Local dev harness (serve only). `npm run dev` opens dev/host.html, a mock
 * StageBridge host that iframes the app the way Author does. This plugin is
 * the server half: it reads app.config.json / APIShape.json / mcp.adapter.json
 * and plays the backend for secrets + third-party calls using PG3_SECRET_*
 * from .env.local, so key values never reach the browser.
 *
 * Mirrors (simplified) the host rules in apps/web/shared/playground3/apiShape.ts:
 * call id lookup, host allowlist, path glob, {{secret.NAME}} injection,
 * secret redaction in the response. It is not the production Lambda.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "vite";

const SECRET_TEMPLATE = /\{\{secret\.([A-Z][A-Z0-9_]{1,63})\}\}/g;
const ROUTE_PREFIX = "/__pg3dev/";
const HOST_PAGE = "/dev/host.html";
const STAGE_SDK_PACKAGE = "@startdownnotez404/playground3-stage-sdk";

const readJson = (filePath) => {
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, "utf8"));
};

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const expandSecrets = (value, secrets, used) => {
  if (typeof value === "string") {
    return value.replace(SECRET_TEMPLATE, (_match, name) => {
      const secret = secrets[name];
      if (!secret) {
        throw new Error(`No key saved for ${name}. Set PG3_SECRET_${name} in .env.local.`);
      }
      used.set(name, secret);
      return secret;
    });
  }
  if (Array.isArray(value)) {
    return value.map((entry) => expandSecrets(entry, secrets, used));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, expandSecrets(entry, secrets, used)])
    );
  }
  return value;
};

const redact = (text, used) => {
  let next = text;
  for (const [name, secret] of used) {
    next = next.split(secret).join(`{{secret.${name}}}`);
  }
  return next;
};

const matchPathGlob = (glob, pathname) => {
  if (!glob.startsWith("/") || !pathname.startsWith("/")) {
    return false;
  }
  if (glob.includes("..") || pathname.includes("..")) {
    return false;
  }
  const escaped = glob
    .split("*")
    .map((part) => part.replace(/[.+^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]+");
  return new RegExp(`^${escaped}$`).test(pathname);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large."));
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Request body is not JSON."));
      }
    });
    req.on("error", reject);
  });

const sendJson = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
};

const declaredSecretNames = (appConfig) => [
  ...(Array.isArray(appConfig?.appSecrets) ? appConfig.appSecrets : []),
  ...(Array.isArray(appConfig?.scopedSecrets) ? appConfig.scopedSecrets : []),
]
  .map((entry) => (typeof entry?.name === "string" ? entry.name.trim() : ""))
  .filter(Boolean);

const runShapeCall = async ({ call, params, secrets }) => {
  const used = new Map();
  let url;
  if (typeof call.url === "string" && call.url.trim()) {
    url = new URL(expandSecrets(call.url.trim(), secrets, used));
  } else {
    const hosts = Array.isArray(call.hosts) ? call.hosts.map((h) => String(h).toLowerCase()) : [];
    const host = String(params.host ?? hosts[0] ?? "").toLowerCase();
    if (!hosts.includes(host)) {
      throw new Error("Host is not allowlisted.");
    }
    const pathname = String(params.path ?? call.path ?? "");
    if (!matchPathGlob(String(call.path ?? ""), pathname)) {
      throw new Error("Path is not allowlisted.");
    }
    url = new URL(`https://${host}${pathname}`);
  }
  // Shape values win over app params (the app cannot override a secret slot).
  const query = expandSecrets({ ...(params.query ?? {}), ...(call.query ?? {}) }, secrets, used);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  const headers = expandSecrets({ ...(params.headers ?? {}), ...(call.headers ?? {}) }, secrets, used);
  const method = String(call.method ?? "GET").toUpperCase();
  const bodyValue =
    method === "GET" || method === "DELETE"
      ? undefined
      : expandSecrets({ ...(params.body ?? {}), ...(call.body ?? {}) }, secrets, used);
  if (bodyValue !== undefined && !Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(url, {
    method,
    headers,
    body: bodyValue === undefined ? undefined : JSON.stringify(bodyValue),
  });
  const text = redact(await response.text(), used);
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return {
    ok: response.ok,
    httpStatus: response.status,
    message: response.ok ? "OK" : `HTTP ${response.status}`,
    payload,
  };
};

const isInWebContainer = () => Boolean(process.versions?.webcontainer);

/** @param {{ rootDir: string }} options */
export const playground3DevHost = ({ rootDir }) => {
  let secrets = {};
  let inferenceDelayMs = 400;

  return {
    name: "playground3-dev-host",
    apply: "serve",
    config(config, { mode }) {
      const env = loadEnv(mode, rootDir, "PG3_");
      secrets = Object.fromEntries(
        Object.entries(env)
          .filter(([key, value]) => key.startsWith("PG3_SECRET_") && value)
          .map(([key, value]) => [key.slice("PG3_SECRET_".length), value])
      );
      const delay = Number(env.PG3_DEV_INFERENCE_DELAY_MS);
      if (Number.isFinite(delay) && delay >= 0) {
        inferenceDelayMs = delay;
      }
      // Author's WebContainer previews `/` itself and its overlay adds the
      // shims that make the excluded SDK load there. Leave that path alone.
      if (isInWebContainer()) {
        return undefined;
      }
      // On a laptop, let Vite prebundle the SDK so its CJS deps (react-is,
      // prop-types, …) get ESM interop. vite.config.mjs keeps the literal
      // exclude because Author's overlay rewrites that file by pattern.
      const exclude = config.optimizeDeps?.exclude;
      if (Array.isArray(exclude)) {
        config.optimizeDeps.exclude = exclude.filter((spec) => spec !== STAGE_SDK_PACKAGE);
      }
      return env.PG3_DEV_OPEN === "0" ? undefined : { server: { open: HOST_PAGE } };
    },
    configureServer(server) {
      const load = () => ({
        appConfig: readJson(path.join(rootDir, "app.config.json")),
        apiShape: readJson(path.join(rootDir, "APIShape.json")),
        adapter: readJson(path.join(rootDir, "mcp.adapter.json")),
      });

      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith(ROUTE_PREFIX)) {
          next();
          return;
        }
        try {
          const route = url.slice(ROUTE_PREFIX.length).split("?")[0];

          // Built single-file HTML, served raw (Vite's HTML transform chokes on
          // a multi-MB inline bundle). Only dist/*.html.
          if (route.startsWith("bundle/") && req.method === "GET") {
            const relative = decodeURIComponent(route.slice("bundle/".length));
            if (!/^dist\/[A-Za-z0-9._-]+\.html$/.test(relative)) {
              sendJson(res, 400, { error: "Only dist/*.html bundles can be served." });
              return;
            }
            const file = path.join(rootDir, relative);
            if (!existsSync(file)) {
              sendJson(res, 404, { error: `${relative} not found. Run npm run build first.` });
              return;
            }
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(readFileSync(file));
            return;
          }

          const { appConfig, apiShape, adapter } = load();

          if (route === "config" && req.method === "GET") {
            const names = declaredSecretNames(appConfig);
            sendJson(res, 200, {
              appConfig,
              adapter,
              hasApiShape: Boolean(apiShape),
              inferenceDelayMs,
              // Metadata only. Values stay in this process.
              secrets: Object.fromEntries(
                names.map((name) => [
                  name,
                  secrets[name] ? { name, last4: secrets[name].slice(-4) } : null,
                ])
              ),
            });
            return;
          }

          if ((route === "third-party" || route === "probe") && req.method === "POST") {
            const body = await readBody(req);
            const name = String(body.name ?? "").trim();
            if (!declaredSecretNames(appConfig).includes(name)) {
              throw new Error(`${name || "This secret"} is not listed on the host manifest.`);
            }
            if (!apiShape || !Array.isArray(apiShape.calls)) {
              throw new Error("APIShape.json is missing. Copy samples/APIShape.json to the app root.");
            }
            const calls = apiShape.calls;
            const call =
              route === "probe"
                ? calls.find((entry) => entry.probe === true && JSON.stringify(entry).includes(`{{secret.${name}}}`))
                : calls.find((entry) => entry.id === String(body.action ?? "").trim());
            if (!call) {
              throw new Error(route === "probe" ? `No probe call for ${name} in APIShape.json.` : "Unknown APIShape action.");
            }
            if (route === "third-party" && call.probe === true) {
              throw new Error("Probe calls run only from ChatDock Test.");
            }
            const params = body.paramsJson ? JSON.parse(String(body.paramsJson)) : {};
            const result = await runShapeCall({ call, params, secrets });
            sendJson(res, 200, route === "probe" ? { ok: result.ok, httpStatus: result.httpStatus, message: result.message } : result);
            return;
          }

          sendJson(res, 404, { error: `Unknown dev route ${route}` });
        } catch (error) {
          sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
      });

      server.httpServer?.once("listening", () => {
        const address = server.httpServer?.address();
        const port = typeof address === "object" && address ? address.port : server.config.server.port;
        server.config.logger.info(
          `\n  Playground3 mock host: http://localhost:${port}${HOST_PAGE}\n`
        );
      });
    },
  };
};
