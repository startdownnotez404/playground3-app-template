/**
 * Mock StageBridge host for local dev. Plays the role of Author /
 * /playground3/bundle: iframes the app with `#playgroundId=…`, answers the
 * iframe's `platform.*` / `dock.*` requests, and drives `stage.*` calls.
 *
 * What is mocked:
 * - inference: no model. "/call <tool> <json>" in the composer calls that
 *   MCP tool through stage.callTool; any other text gets a canned reply.
 * - records: localStorage, kinds checked against app.config.json appRecords,
 *   16 KB per row (same limit as the backend).
 * - secrets: values come from PG3_SECRET_<NAME> in .env.local and stay in the
 *   Vite process (dev/devHostPlugin.mjs). The iframe only sees last4.
 * - attachedMcp: connect returns the adapter's catalog tools; callTool echoes
 *   the args. Test against the real MCP Connector (127.0.0.1:3920) in Author.
 *
 * Protocol: apps/web/src/features/playground3/runtime/protocol/stageBridgeProtocol.ts
 */
const CHANNEL = "playground3.stageBridge";
const VERSION = 1;
const RECORD_MAX_BYTES = 16 * 1024;
const RECORDS_STORAGE_KEY = "pg3dev.records";
const SESSION_ID = "dev-session";
const NODE_GRAPH_ID = "dev-node-graph";

const $ = (id) => document.getElementById(id);
const iframe = $("app");

let appConfig = null;
let devConfig = null;
let playgroundId = "";
let appearance = "light";
let registeredApp = null;
let attachedRuntime = null;
let checkpointCount = 0;
const pendingStageRequests = new Map();
const sessionObjects = new Map();

// ── log ──────────────────────────────────────────────────────────────────

const short = (value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text && text.length > 400 ? `${text.slice(0, 400)}…` : text ?? "";
};

const log = (cls, label, detail) => {
  const row = document.createElement("div");
  row.className = cls;
  row.innerHTML = `<pre></pre>`;
  row.firstChild.textContent = `${label}${detail === undefined ? "" : ` ${short(detail)}`}`;
  $("log").prepend(row);
  while ($("log").childElementCount > 200) {
    $("log").lastChild.remove();
  }
};

// ── envelope helpers ───────────────────────────────────────────────────────

const post = (message) => {
  iframe.contentWindow?.postMessage(
    { channel: CHANNEL, version: VERSION, playgroundId, message },
    "*"
  );
};

const hostState = () => ({
  canInvoke: true,
  appSecretGateBlocksWork: false,
  creditsBlocked: false,
  isPrimary: true,
  isRoomObserver: false,
  appearanceMode: appearance,
  sessionId: SESSION_ID,
  nodeGraphId: NODE_GRAPH_ID,
  statusMessage: null,
  errorMessage: null,
  selectedModelId: "mock",
  agentModelIds: {},
  selectedGraphKey: registeredApp?.defaultGraphKey ?? null,
  isAutoPlaying: false,
  isRunning: false,
  isAuthenticated: true,
});

const requestStage = (method, params) =>
  new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      pendingStageRequests.delete(id);
      reject(new Error(`${method} timed out`));
    }, 30_000);
    pendingStageRequests.set(id, { resolve, reject, timer, method });
    log("in", `→ ${method}`, params);
    post({ kind: "request", id, method, params });
  });

// ── records (mock backend rows) ────────────────────────────────────────────

const loadRecords = () => {
  try {
    return JSON.parse(localStorage.getItem(`${RECORDS_STORAGE_KEY}.${playgroundId}`) ?? "[]");
  } catch {
    return [];
  }
};

const saveRecords = (rows) => {
  localStorage.setItem(`${RECORDS_STORAGE_KEY}.${playgroundId}`, JSON.stringify(rows));
  renderRecords();
};

const requireKind = (kind) => {
  const declared = (appConfig?.appRecords ?? []).map((entry) => entry.kind);
  const trimmed = String(kind ?? "").trim();
  if (!declared.includes(trimmed)) {
    throw new Error(`${trimmed || "This kind"} is not listed on the host manifest (app.config.json appRecords).`);
  }
  return trimmed;
};

const rejectIframePlaygroundId = (params) => {
  if (params && "playgroundId" in params) {
    throw new Error("Do not send playgroundId. The host stamps it from the session.");
  }
};

// ── dev server routes (secrets + third-party) ──────────────────────────────

const devFetch = async (route, body) => {
  const response = await fetch(`/__pg3dev/${route}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error ?? `Dev route ${route} failed.`);
  }
  return json;
};

const requireDeclaredSecret = (name) => {
  const trimmed = String(name ?? "").trim();
  if (!devConfig || !(trimmed in devConfig.secrets)) {
    throw new Error(`${trimmed || "This secret"} is not listed on the host manifest.`);
  }
  return trimmed;
};

// ── mock attached MCP ──────────────────────────────────────────────────────

const namespaced = (name, namespace) =>
  !namespace || name.startsWith(`${namespace}.`) ? name : `${namespace}.${name}`;

const connectMockAttachedMcp = (adapter, routeId) => {
  if (!adapter || typeof adapter !== "object") {
    throw new Error("attachedMcp.connect needs adapter.");
  }
  const url = String(adapter.server?.url ?? "");
  if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//.test(url)) {
    throw new Error("Attached MCP server.url must be loopback (MCP Connector is http://127.0.0.1:3920/mcp).");
  }
  if (adapter.connector != null) {
    throw new Error("Playground3 MCP adapter `connector` recipes are no longer supported. Use `requires` and `proposals`.");
  }
  const tools = (adapter.catalog?.tools ?? []).map((tool) => ({
    ...tool,
    name: namespaced(tool.name, adapter.namespace),
  }));
  attachedRuntime = {
    adapter,
    routeId: routeId || playgroundId,
    liveTools: tools,
    mergedManifest: { version: 1, routeId: routeId || playgroundId, tools },
    lastScreenshotDataUrl: null,
    lastError: tools.length > 0 ? null : "Mock connector: adapter has no catalog.tools.",
  };
  $("attached").textContent = `Mock-connected to ${url}\nrequires: ${JSON.stringify(adapter.requires ?? [])}\ntools: ${tools.map((t) => t.name).join(", ") || "none"}`;
  return { ...attachedRuntime, ok: true, httpStatus: 200 };
};

// ── host request handler (iframe → host) ──────────────────────────────────

const handleHostRequest = async (method, params) => {
  const p = params && typeof params === "object" ? params : {};
  switch (method) {
    case "platform.startSession":
      return { session: { id: SESSION_ID }, nodeGraph: { id: NODE_GRAPH_ID } };
    case "platform.saveCheckpoint":
      checkpointCount += 1;
      $("checkpoint").textContent = `#${checkpointCount} (${p.sourceKind ?? "?"})\n${p.frontendStateJson ?? ""}`;
      return { checkpointId: `dev-checkpoint-${checkpointCount}` };
    case "platform.runInference":
    case "platform.startInference":
      await new Promise((r) => setTimeout(r, devConfig?.inferenceDelayMs ?? 0));
      return { content: "[mock inference] No model in the dev host. Test real turns in Author." };
    case "platform.getInferenceJob":
    case "platform.submitTransition":
    case "platform.closeSession":
    case "platform.submitHumanInput":
    case "platform.subscribeToChunks":
    case "platform.unsubscribeFromChunks":
    case "platform.subscribeToInferenceJob":
    case "platform.unsubscribeFromInferenceJob":
      return null;
    case "dock.waitHumanGate":
      return window.confirm(`Human approval requested (${p.nodeRunId ?? "?"}). Approve?`)
        ? "approved"
        : "rejected";
    case "dock.waitHumanAnswer":
      return window.prompt(String(p.question ?? "The agent asks:")) ?? "";

    case "dock.registerApp":
      registeredApp = p;
      $("title").textContent = String(p.title ?? appConfig?.title ?? "Playground3 app");
      post({ kind: "hostState", state: hostState() });
      setTimeout(refreshTools, 0);
      return null;
    case "dock.runTurn":
      return runMockTurn(String(p.turnUserMessage ?? ""), p);
    case "dock.setStatus":
    case "dock.setError":
    case "dock.setRuntimeTitle":
      return null;

    case "dock.putAppRecord": {
      rejectIframePlaygroundId(p);
      const kind = requireKind(p.kind);
      const payloadJson = JSON.stringify(p.payload ?? null);
      const bytes = new TextEncoder().encode(payloadJson).byteLength;
      if (bytes > RECORD_MAX_BYTES) {
        throw new Error(`Record is ${bytes} bytes. App records are limited to ${RECORD_MAX_BYTES} bytes.`);
      }
      const id = typeof p.id === "string" && p.id.trim() ? p.id.trim() : crypto.randomUUID();
      const row = { kind, id, payload: JSON.parse(payloadJson), bytes, createdAt: new Date().toISOString() };
      saveRecords([...loadRecords().filter((r) => !(r.kind === kind && r.id === id)), row]);
      return row;
    }
    case "dock.listAppRecords": {
      rejectIframePlaygroundId(p);
      const kind = p.kind ? requireKind(p.kind) : null;
      return loadRecords().filter((row) => !kind || row.kind === kind);
    }
    case "dock.getAppRecord": {
      rejectIframePlaygroundId(p);
      const kind = requireKind(p.kind);
      return loadRecords().find((row) => row.kind === kind && row.id === p.id) ?? null;
    }
    case "dock.deleteAppRecord": {
      rejectIframePlaygroundId(p);
      const kind = requireKind(p.kind);
      const rows = loadRecords();
      const row = rows.find((r) => r.kind === kind && r.id === p.id);
      if (!row) {
        throw new Error("Record not found.");
      }
      saveRecords(rows.filter((r) => r !== row));
      return row;
    }
    case "dock.deleteAppRecords": {
      rejectIframePlaygroundId(p);
      const kind = requireKind(p.kind);
      const rows = loadRecords();
      saveRecords(rows.filter((r) => r.kind !== kind));
      return rows.filter((r) => r.kind === kind);
    }

    case "dock.upsertAppSecret":
      throw new Error("API keys are registered in ChatDock, not from the app.");
    case "dock.getAppSecretMeta": {
      const name = requireDeclaredSecret(p.name);
      return devConfig.secrets[name];
    }
    case "dock.requestAppSecret": {
      const name = requireDeclaredSecret(p.name);
      log("err", `App asked for ${name}. Set PG3_SECRET_${name} in .env.local and restart npm run dev.`);
      return devConfig.secrets[name];
    }
    case "dock.deleteAppSecret":
      throw new Error("Dev host: remove the PG3_SECRET_* line from .env.local instead.");
    case "dock.testAppSecret": {
      rejectIframePlaygroundId(p);
      const name = requireDeclaredSecret(p.name);
      return devFetch("probe", { name });
    }
    case "dock.callAppThirdPartyAPI": {
      rejectIframePlaygroundId(p);
      if ("shapeJson" in p || "url" in p || "scope" in p) {
        throw new Error("Do not send shapeJson, url, or scope. The host stamps them from APIShape.json.");
      }
      return devFetch("third-party", {
        name: requireDeclaredSecret(p.name),
        action: p.action,
        paramsJson: p.paramsJson,
      });
    }

    case "platform.attachedMcp.connect":
      rejectIframePlaygroundId(p);
      return connectMockAttachedMcp(p.adapter, p.routeId);
    case "platform.attachedMcp.disconnect":
      attachedRuntime = null;
      $("attached").textContent = "Not connected.";
      return null;
    case "platform.attachedMcp.getRuntime":
      return attachedRuntime;
    case "platform.attachedMcp.callTool": {
      if (!attachedRuntime) {
        return { success: false, message: "Attached MCP is not connected.", ok: false, httpStatus: null };
      }
      const name = String(p.name ?? "");
      if (!attachedRuntime.liveTools.some((tool) => tool.name === name || tool.name.endsWith(`.${name}`))) {
        return { success: false, message: `Unknown attached MCP tool ${name}.`, ok: false, httpStatus: null };
      }
      return {
        success: true,
        message: `[mock] ${name} called. Real results come from MCP Connector in Author.`,
        data: { args: p.args ?? {} },
        ok: true,
        httpStatus: 200,
      };
    }

    case "platform.storage.put": {
      const key = String(p.name ?? "object");
      sessionObjects.set(key, { body: p.body, contentType: p.contentType });
      return { key };
    }
    case "platform.storage.get":
      return sessionObjects.get(String(p.key ?? p.name ?? "")) ?? null;
    case "platform.storage.remove":
      sessionObjects.delete(String(p.key ?? p.name ?? ""));
      return null;

    default:
      // dock.beginTurn, dock.setIsRunning, dock.emitStreamChunk, … are UI-only
      // on the real host. Accept them silently.
      return null;
  }
};

// ── mock turns + tool panel (host → iframe) ────────────────────────────────

const parseCall = (text) => {
  const match = /^\/call\s+(\S+)\s*([\s\S]*)$/.exec(text.trim());
  if (!match) {
    return null;
  }
  const args = match[2].trim() ? JSON.parse(match[2]) : {};
  return { name: match[1], args };
};

async function runMockTurn(text, turn = {}) {
  $("turnStatus").textContent = "Running…";
  const nodeRunId = turn.nodeRunId ?? `dev-node-run-${Date.now()}`;
  try {
    const context = await requestStage("stage.getTurnContext", {
      graphKey: turn.graphKey ?? registeredApp?.defaultGraphKey ?? "main",
    });
    const call = parseCall(text);
    let reply;
    if (call) {
      const outcome = await requestStage("stage.callTool", {
        name: call.name,
        args: call.args,
        caller: { agentId: "mock", nodeId: turn.firstNodeId ?? "mock", nodeRunId },
      });
      reply = `${call.name} → ${JSON.stringify(outcome?.result ?? outcome, null, 2)}`;
    } else {
      await new Promise((r) => setTimeout(r, devConfig?.inferenceDelayMs ?? 0));
      const tools = JSON.parse(context?.manifestJson ?? "{}").tools ?? [];
      reply =
        `[mock inference] No model here. Tools the agent could call: ${tools.map((t) => t.name).join(", ") || "none"}.\n` +
        `Try: /call ${tools[0]?.name ?? "tool.name"} {}`;
    }
    $("reply").textContent = reply;
    $("turnStatus").textContent = "Done.";
    return { sessionId: SESSION_ID, nodeGraphId: NODE_GRAPH_ID, nodeRunId };
  } catch (error) {
    $("reply").textContent = String(error?.message ?? error);
    $("turnStatus").textContent = "Failed.";
    throw error;
  }
}

const exampleArgs = (schema) => {
  const props = schema?.properties ?? {};
  const out = {};
  for (const key of schema?.required ?? []) {
    const type = props[key]?.type;
    out[key] = type === "number" || type === "integer" ? 0 : type === "boolean" ? false : type === "object" ? {} : type === "array" ? [] : "example";
  }
  return out;
};

async function refreshTools() {
  try {
    const context = await requestStage("stage.getTurnContext", {
      graphKey: registeredApp?.defaultGraphKey ?? "main",
    });
    const manifest = JSON.parse(context?.manifestJson ?? "{}");
    const container = $("tools");
    container.textContent = "";
    for (const tool of manifest.tools ?? []) {
      const box = document.createElement("div");
      box.className = "tool";
      box.innerHTML = `<div><code></code></div><div class="muted desc"></div><textarea rows="2"></textarea><div class="row" style="margin-top:4px"><button>Call</button><pre class="muted out"></pre></div>`;
      box.querySelector("code").textContent = tool.name;
      box.querySelector(".desc").textContent = tool.description ?? "";
      const argsField = box.querySelector("textarea");
      argsField.value = JSON.stringify(exampleArgs(tool.inputSchema));
      box.querySelector("button").addEventListener("click", async () => {
        const out = box.querySelector(".out");
        try {
          const outcome = await requestStage("stage.callTool", {
            name: tool.name,
            args: JSON.parse(argsField.value || "{}"),
            caller: { agentId: "mock", nodeId: "devHost", nodeRunId: `dev-${Date.now()}` },
          });
          out.textContent = short(outcome?.result ?? outcome);
        } catch (error) {
          out.textContent = String(error?.message ?? error);
        }
      });
      container.append(box);
    }
    if (!manifest.tools?.length) {
      container.textContent = "Manifest has no tools.";
    }
  } catch (error) {
    $("tools").textContent = String(error?.message ?? error);
  }
}

function renderRecords() {
  const rows = loadRecords();
  $("records").textContent = rows.length
    ? rows.map((r) => `${r.kind}/${r.id} (${r.bytes} B)\n${short(r.payload)}`).join("\n\n")
    : `No rows. Declared kinds: ${(appConfig?.appRecords ?? []).map((e) => e.kind).join(", ") || "none"}`;
}

function renderSecrets() {
  const entries = Object.entries(devConfig?.secrets ?? {});
  $("secrets").textContent = entries.length
    ? entries
        .map(([name, meta]) => `${name}: ${meta ? `set (…${meta.last4})` : `missing — add PG3_SECRET_${name} to .env.local`}`)
        .join("\n")
    : "No appSecrets / scopedSecrets declared in app.config.json.";
}

// ── wiring ────────────────────────────────────────────────────────────────

window.addEventListener("message", (event) => {
  if (event.source !== iframe.contentWindow) {
    return;
  }
  const data = event.data;
  if (!data || data.channel !== CHANNEL || data.version !== VERSION || data.playgroundId !== playgroundId) {
    return;
  }
  const message = data.message ?? {};
  if (message.kind === "iframeReady") {
    $("ready").textContent = "iframeReady";
    post({ kind: "hostState", state: hostState() });
    return;
  }
  if (message.kind === "previewPainted") {
    $("ready").textContent = "painted";
    return;
  }
  if (message.kind === "response") {
    const pending = pendingStageRequests.get(message.id);
    if (!pending) {
      return;
    }
    pendingStageRequests.delete(message.id);
    clearTimeout(pending.timer);
    if (message.ok) {
      log("out", `← ${pending.method}`, message.result);
      pending.resolve(message.result);
    } else {
      log("err", `← ${pending.method} failed`, message.error?.message);
      pending.reject(new Error(message.error?.message ?? "Stage request failed."));
    }
    return;
  }
  if (message.kind === "request") {
    const quiet = message.method === "dock.emitStreamChunk" || message.method === "dock.setIsRunning";
    if (!quiet) {
      log("in", `↓ ${message.method}`, message.params);
    }
    handleHostRequest(message.method, message.params).then(
      (result) => post({ kind: "response", id: message.id, ok: true, result: result ?? null }),
      (error) => {
        log("err", `✗ ${message.method}`, error?.message ?? String(error));
        post({ kind: "response", id: message.id, ok: false, error: { message: error?.message ?? String(error) } });
      }
    );
  }
});

// `?bundle=dist/index.html` loads the built single-file HTML instead of the
// Vite dev entry (run `npm run build` first) — the same file Author publishes.
const bundlePath = new URLSearchParams(location.search).get("bundle")?.replace(/^\/+/, "");

const loadApp = () => {
  const hash = new URLSearchParams({ playgroundId, appearance }).toString();
  iframe.src = `${bundlePath ? `/__pg3dev/bundle/${bundlePath}` : "/index.html"}#${hash}`;
  $("ready").textContent = "waiting for iframeReady";
};

$("appearance").addEventListener("click", () => {
  appearance = appearance === "light" ? "dark" : "light";
  document.documentElement.dataset.appearance = appearance;
  $("appearance").textContent = appearance === "light" ? "Dark" : "Light";
  post({ kind: "appearance", mode: appearance });
  post({ kind: "hostState", state: hostState() });
});
$("reload").addEventListener("click", loadApp);
$("send").addEventListener("click", () => {
  const text = $("prompt").value;
  void runMockTurn(text).catch(() => undefined);
});
$("recordsRefresh").addEventListener("click", renderRecords);
$("recordsClear").addEventListener("click", () => saveRecords([]));

devConfig = await devFetch("config");
appConfig = devConfig.appConfig;
playgroundId = String(appConfig?.id ?? "").trim();
if (!playgroundId) {
  $("subtitle").textContent = "app.config.json needs an id. Run npm run check.";
} else {
  $("subtitle").textContent = `${playgroundId} · ${bundlePath ? `bundle ${bundlePath}` : "vite dev"}`;
  renderRecords();
  renderSecrets();
  loadApp();
}
