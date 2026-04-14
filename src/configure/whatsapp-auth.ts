import * as qrcodeTerminal from "qrcode-terminal";
import { buildWhatsAppLaunchOptions } from "../listeners/whatsapp/launch-options";
import { whatsappSessionRoot } from "../paths";

export type WhatsAppAuthConfig = {
  session_path?: string;
  client_id?: string;
  puppeteer_executable_path?: string;
};

export type WhatsAppSessionDetails = {
  platform?: string;
  phoneModel?: string;
  phoneNumber?: string;
  pushName?: string;
  wid?: string;
};

export type WhatsAppAuthState = {
  status:
    | "idle"
    | "connecting"
    | "qr_ready"
    | "authenticated"
    | "ready"
    | "disconnected"
    | "error";
  qrAscii?: string;
  qrUpdates: number;
  error?: string;
  details?: WhatsAppSessionDetails;
};

type WhatsAppClient = {
  info?: unknown;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  initialize: () => Promise<void>;
  destroy: () => Promise<void>;
};

type WhatsAppModule = {
  Client: new (args: Record<string, unknown>) => WhatsAppClient;
  LocalAuth: new (args: Record<string, unknown>) => unknown;
};

export type WhatsAppAuthHandle = {
  stop: () => Promise<void>;
};

export async function startWhatsAppAuth(
  config: WhatsAppAuthConfig,
  onState: (next: WhatsAppAuthState) => void,
): Promise<WhatsAppAuthHandle> {
  onState({ status: "connecting", qrUpdates: 0 });
  const mod = (await import("whatsapp-web.js")) as WhatsAppModule;
  const authRoot = whatsappSessionRoot(config.session_path);
  const client = new mod.Client({
    authStrategy: new mod.LocalAuth({
      clientId: config.client_id ?? "default",
      dataPath: authRoot,
    }),
    ...buildWhatsAppLaunchOptions(config),
  });

  let qrUpdates = 0;

  client.on("qr", (qr) => {
    const value = String(qr ?? "");
    if (!value.trim()) {
      return;
    }
    qrUpdates += 1;
    onState({
      status: "qr_ready",
      qrAscii: toQrAscii(value),
      qrUpdates,
    });
  });

  client.on("authenticated", () => {
    onState({
      status: "authenticated",
      qrUpdates,
    });
  });

  client.on("ready", () => {
    onState({
      status: "ready",
      qrUpdates,
      details: extractSessionDetails(client.info),
    });
  });

  client.on("auth_failure", (message) => {
    onState({
      status: "error",
      qrUpdates,
      error: `Authentication failed: ${String(message)}`,
      details: extractSessionDetails(client.info),
    });
  });

  client.on("disconnected", (reason) => {
    onState({
      status: "disconnected",
      qrUpdates,
      error: String(reason),
      details: extractSessionDetails(client.info),
    });
  });

  client.initialize().catch((error: unknown) => {
    onState({
      status: "error",
      qrUpdates,
      error: error instanceof Error ? error.message : String(error),
      details: extractSessionDetails(client.info),
    });
  });

  return {
    async stop() {
      try {
        await client.destroy();
      } finally {
        onState({
          status: "idle",
          qrUpdates: 0,
        });
      }
    },
  };
}

function toQrAscii(value: string): string {
  let text = "";
  qrcodeTerminal.generate(value, { small: true }, (rendered) => {
    text = rendered;
  });
  return text || "QR rendering unavailable.";
}

function extractSessionDetails(rawInfo: unknown): WhatsAppSessionDetails {
  if (!rawInfo || typeof rawInfo !== "object") {
    return {};
  }
  const info = rawInfo as Record<string, unknown>;
  const wid = stringifyWid(info.wid);
  const phone = getRecord(info.phone);

  return {
    platform:
      asTrimmedString(info.platform) ?? asTrimmedString(phone?.wa_version),
    phoneModel: asTrimmedString(phone?.device_model),
    phoneNumber: asTrimmedString(getRecord(info.wid)?.user),
    pushName: asTrimmedString(info.pushname),
    wid,
  };
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function stringifyWid(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  const wid = getRecord(value);
  if (!wid) {
    return undefined;
  }
  return (
    asTrimmedString(wid._serialized) ??
    asTrimmedString(wid.user) ??
    asTrimmedString(wid.server)
  );
}
