/**
 * Direct StageBridge calls for host features the published Stage SDK
 * (npmjs 0.1.9) does not wrap yet: app records, app secrets, third-party API
 * calls, and attached MCP. Same envelope the SDK uses; the host (Author,
 * /playground3/bundle, or dev/host.html locally) answers.
 *
 * Never send `playgroundId`, `url`, `shapeJson`, or a secret value in params:
 * the host stamps the app from the running session and rejects those fields.
 */
const CHANNEL = "playground3.stageBridge";
const VERSION = 1;
const TIMEOUT_MS = 30_000;

export const HOST_METHODS = {
  putAppRecord: "dock.putAppRecord",
  listAppRecords: "dock.listAppRecords",
  getAppRecord: "dock.getAppRecord",
  deleteAppRecord: "dock.deleteAppRecord",
  deleteAppRecords: "dock.deleteAppRecords",
  getAppSecretMeta: "dock.getAppSecretMeta",
  requestAppSecret: "dock.requestAppSecret",
  testAppSecret: "dock.testAppSecret",
  deleteAppSecret: "dock.deleteAppSecret",
  callAppThirdPartyAPI: "dock.callAppThirdPartyAPI",
  attachedMcpConnect: "platform.attachedMcp.connect",
  attachedMcpDisconnect: "platform.attachedMcp.disconnect",
  attachedMcpGetRuntime: "platform.attachedMcp.getRuntime",
  attachedMcpCallTool: "platform.attachedMcp.callTool",
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const playgroundIdFromHash = (): string | null => {
  try {
    return new URLSearchParams(window.location.hash.slice(1)).get("playgroundId");
  } catch {
    return null;
  }
};

const requestId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `pg3app-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/** True inside a StageBridge host (Author, bundle page, or dev/host.html). */
export const hasStageBridgeHost = (): boolean =>
  typeof window !== "undefined" &&
  window.parent !== window &&
  Boolean(playgroundIdFromHash());

export const requestHost = async (
  method: string,
  params: Record<string, unknown> = {}
): Promise<unknown> => {
  const playgroundId = playgroundIdFromHash();
  if (!playgroundId || !hasStageBridgeHost()) {
    throw new Error(
      `No StageBridge host for ${method}. Run \`npm run dev\` (dev/host.html) or open the app in Playground Author.`
    );
  }
  const id = requestId();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error(`Timed out waiting for the host (${method}).`));
    }, TIMEOUT_MS);

    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!isRecord(data) || data.channel !== CHANNEL || data.version !== VERSION) {
        return;
      }
      if (data.playgroundId !== playgroundId || !isRecord(data.message)) {
        return;
      }
      const message = data.message;
      if (message.kind !== "response" || message.id !== id) {
        return;
      }
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      if (message.ok === true) {
        resolve(message.result);
        return;
      }
      const error = isRecord(message.error) ? message.error.message : null;
      reject(
        new Error(
          typeof error === "string" && error.trim() ? error : `Host could not run ${method}.`
        )
      );
    };

    window.addEventListener("message", onMessage);
    window.parent.postMessage(
      {
        channel: CHANNEL,
        version: VERSION,
        playgroundId,
        message: { kind: "request", id, method, params },
      },
      "*"
    );
  });
};

// ── App records: small JSON rows (≤16 KB), kinds declared in app.config.json ──

export type AppRecord = {
  kind: string;
  id: string;
  payload: unknown;
  bytes: number;
  createdAt?: string | null;
};

const toAppRecord = (value: unknown): AppRecord => {
  const row = isRecord(value) ? value : {};
  return {
    kind: typeof row.kind === "string" ? row.kind : "",
    id: typeof row.id === "string" ? row.id : "",
    payload: row.payload,
    bytes: typeof row.bytes === "number" ? row.bytes : 0,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : null,
  };
};

export const putAppRecord = async (input: {
  kind: string;
  payload: unknown;
  id?: string;
}): Promise<AppRecord> =>
  toAppRecord(await requestHost(HOST_METHODS.putAppRecord, input));

export const listAppRecords = async (kind?: string): Promise<AppRecord[]> => {
  const rows = await requestHost(HOST_METHODS.listAppRecords, { kind });
  return Array.isArray(rows) ? rows.map(toAppRecord) : [];
};

export const getAppRecord = async (kind: string, id: string): Promise<AppRecord | null> => {
  const row = await requestHost(HOST_METHODS.getAppRecord, { kind, id });
  return row == null ? null : toAppRecord(row);
};

export const deleteAppRecord = async (kind: string, id: string): Promise<AppRecord> =>
  toAppRecord(await requestHost(HOST_METHODS.deleteAppRecord, { kind, id }));

// ── App secrets: names only; values are entered in ChatDock (or .env.local) ──

export type AppSecretMeta = {
  name: string;
  last4: string | null;
  updatedAt?: string | null;
};

export const getAppSecretMeta = async (name: string): Promise<AppSecretMeta | null> => {
  const meta = await requestHost(HOST_METHODS.getAppSecretMeta, { name });
  if (!isRecord(meta)) {
    return null;
  }
  return {
    name,
    last4: typeof meta.last4 === "string" ? meta.last4 : null,
    updatedAt: typeof meta.updatedAt === "string" ? meta.updatedAt : null,
  };
};

/** Ask the host to prompt the user for this key (ChatDock). */
export const requestAppSecret = (name: string) =>
  requestHost(HOST_METHODS.requestAppSecret, { name });

/**
 * Third-party HTTP through the host. `action` is an APIShape.json call id;
 * the host injects `{{secret.NAME}}` and allowlists host/path.
 */
export const callAppThirdPartyAPI = async (input: {
  name: string;
  action: string;
  params: {
    host?: string;
    path?: string;
    query?: Record<string, unknown>;
    headers?: Record<string, unknown>;
    body?: Record<string, unknown>;
  };
}): Promise<unknown> =>
  requestHost(HOST_METHODS.callAppThirdPartyAPI, {
    name: input.name,
    action: input.action,
    paramsJson: JSON.stringify(input.params),
  });

// ── Attached MCP: host reaches MCP Connector on 127.0.0.1:3920 ──

export const connectAttachedMcp = (adapter: Record<string, unknown>, routeId: string) =>
  requestHost(HOST_METHODS.attachedMcpConnect, { adapter, routeId });

export const disconnectAttachedMcp = () =>
  requestHost(HOST_METHODS.attachedMcpDisconnect, {});

export const callAttachedMcpTool = (name: string, args: Record<string, unknown> = {}) =>
  requestHost(HOST_METHODS.attachedMcpCallTool, { name, args });
