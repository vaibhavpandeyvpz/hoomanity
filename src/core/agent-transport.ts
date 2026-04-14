import { ndJsonStream, type Stream } from "@agentclientprotocol/sdk";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { log } from "./logger";

export type TransportConnection = {
  stream: Stream;
  close: () => Promise<void>;
};

export interface AgentTransport {
  open(): Promise<TransportConnection>;
}

export class StdioAgentTransport implements AgentTransport {
  private child: ReturnType<typeof spawn> | undefined;

  constructor(
    private readonly command: string,
    private readonly cwd: string,
  ) {}

  async open(): Promise<TransportConnection> {
    if (this.child) {
      throw new Error("ACP stdio transport is already open.");
    }

    log.info("spawning ACP stdio process", {
      scope: "transport",
      cwd: this.cwd,
      command: this.command,
    });
    const child = spawn("sh", ["-lc", this.command], {
      cwd: this.cwd,
      stdio: ["pipe", "pipe", "inherit"],
      env: process.env,
    });

    this.child = child;
    await this.assertLikelyAcpOutput(child);
    log.info("ACP stdio process looks healthy", { scope: "transport" });

    const writable = Writable.toWeb(child.stdin);
    const readable = Readable.toWeb(
      child.stdout,
    ) as unknown as ReadableStream<Uint8Array>;
    const stream = ndJsonStream(writable, readable);

    return {
      stream,
      close: async () => {
        if (!this.child) {
          return;
        }
        const running = this.child;
        this.child = undefined;
        log.info("stopping ACP stdio process", { scope: "transport" });
        running.kill("SIGTERM");
      },
    };
  }

  private async assertLikelyAcpOutput(
    child: ReturnType<typeof spawn>,
  ): Promise<void> {
    if (!child.stdout) {
      throw new Error("ACP agent process stdout is not available.");
    }
    const stdout = child.stdout;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const settleResolve = () => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve();
        }
      };
      const settleReject = (error: Error) => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(error);
        }
      };

      const timer = setTimeout(settleResolve, 200);

      const onData = (chunk: Buffer) => {
        const text = chunk.toString("utf-8").trim();
        if (!text) {
          return;
        }

        const firstLine = text.split("\n")[0] ?? "";
        const looksLikeJsonRpc = firstLine.startsWith("{");

        if (!looksLikeJsonRpc) {
          child.kill("SIGTERM");
          settleReject(
            new Error(
              `ACP agent command did not start in JSON-RPC mode. Command "${this.command}" wrote "${firstLine}" to stdout. Configure "acpAgentCommand" to start an ACP stdio server.`,
            ),
          );
          return;
        }

        settleResolve();
      };

      const onExit = (code: number | null) => {
        settleReject(
          new Error(
            `ACP agent process exited early with code ${code ?? "unknown"}.`,
          ),
        );
      };

      const cleanup = () => {
        clearTimeout(timer);
        stdout.off("data", onData);
        child.off("exit", onExit);
      };

      stdout.on("data", onData);
      child.on("exit", onExit);
    });
  }
}
