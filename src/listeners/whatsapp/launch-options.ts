export type WhatsAppLaunchConfig = {
  puppeteer_executable_path?: string;
};

const DEFAULT_PROTOCOL_TIMEOUT_MS = 180000;

export function buildWhatsAppLaunchOptions(config: WhatsAppLaunchConfig): {
  puppeteer: {
    executablePath?: string;
    protocolTimeout: number;
  };
} {
  return {
    puppeteer: {
      protocolTimeout: DEFAULT_PROTOCOL_TIMEOUT_MS,
      ...(config.puppeteer_executable_path
        ? { executablePath: config.puppeteer_executable_path }
        : {}),
    },
  };
}
