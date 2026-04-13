import { homedir } from "node:os";
import { join } from "node:path";
import * as qrcodeTerminal from "qrcode-terminal";
import { log } from "../../core/logger";

type WwebjsConfigureConfig = {
  session_path?: string;
  client_id?: string;
  puppeteer_executable_path?: string;
};

export async function configureWwebjsSession(
  config: WwebjsConfigureConfig,
): Promise<void> {
  const mod = (await import("whatsapp-web.js")) as {
    Client: new (args: Record<string, unknown>) => {
      on: (event: string, cb: (...args: unknown[]) => void) => void;
      initialize: () => Promise<void>;
      destroy: () => Promise<void>;
    };
    LocalAuth: new (args: Record<string, unknown>) => unknown;
  };

  const authRoot = join(
    homedir(),
    ".hooman",
    "wwebjs",
    config.session_path ?? "default",
  );
  const client = new mod.Client({
    authStrategy: new mod.LocalAuth({
      clientId: config.client_id ?? "default",
      dataPath: authRoot,
    }),
    ...(config.puppeteer_executable_path
      ? { puppeteer: { executablePath: config.puppeteer_executable_path } }
      : {}),
  });

  const qrOpts = { small: true };
  let connected = false;
  let qrUpdates = 0;
  let lastQr = "";

  try {
    await new Promise<void>((resolve, reject) => {
      client.on("qr", (qr) => {
        const value = String(qr ?? "");
        if (!value || value === lastQr) return;
        lastQr = value;
        qrUpdates += 1;
        console.clear();
        console.log("Scan this QR with WhatsApp to connect wwebjs.\n");
        qrcodeTerminal.generate(value, qrOpts);
        console.log(`\nQR update #${qrUpdates} (refreshes automatically).`);
      });

      client.on("authenticated", () => {
        log("info", "wwebjs-configure", "authenticated; waiting for ready");
      });

      client.on("ready", () => {
        connected = true;
        console.log("\nwwebjs connected successfully.");
        resolve();
      });

      client.on("auth_failure", (message) => {
        reject(new Error(`wwebjs auth failure: ${String(message)}`));
      });

      client.on("disconnected", (reason) => {
        if (!connected) {
          reject(
            new Error(`wwebjs disconnected before ready: ${String(reason)}`),
          );
        }
      });

      client.initialize().catch(reject);
    });
  } finally {
    try {
      await client.destroy();
    } catch {
      // no-op
    }
  }
}
