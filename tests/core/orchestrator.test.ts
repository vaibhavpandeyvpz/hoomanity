import { describe, expect, it, mock } from "bun:test";
import { CoreOrchestrator } from "../../src/core/orchestrator";

describe("CoreOrchestrator.cancelInFlight", () => {
  it("returns false when there is no active turn or pending approval", async () => {
    const acpClient = {
      cancelSessionTurn: mock(async () => {}),
    } as any;
    const sessionRegistry = {
      getPersisted: () => ({
        sessionId: "session-1",
        cwd: "/tmp/workspace",
        updatedAt: Date.now(),
      }),
    } as any;
    const approvals = {
      hasPendingForSession: () => false,
      cancelForSession: mock(() => {}),
    } as any;
    const turnQueue = {
      hasActive: () => false,
    } as any;
    const orchestrator = new CoreOrchestrator(
      acpClient,
      sessionRegistry,
      approvals,
      turnQueue,
      "/tmp/workspace",
    );

    const result = await orchestrator.cancelInFlight("slack:C123");

    expect(result).toEqual({ cancelled: false });
    expect(acpClient.cancelSessionTurn).not.toHaveBeenCalled();
    expect(approvals.cancelForSession).not.toHaveBeenCalled();
  });

  it("returns true and cancels pending approvals even without an active turn", async () => {
    const acpClient = {
      cancelSessionTurn: mock(async () => {}),
    } as any;
    const sessionRegistry = {
      getPersisted: () => ({
        sessionId: "session-1",
        cwd: "/tmp/workspace",
        updatedAt: Date.now(),
      }),
    } as any;
    const approvals = {
      hasPendingForSession: () => true,
      cancelForSession: mock(() => {}),
    } as any;
    const turnQueue = {
      hasActive: () => false,
    } as any;
    const orchestrator = new CoreOrchestrator(
      acpClient,
      sessionRegistry,
      approvals,
      turnQueue,
      "/tmp/workspace",
    );

    const result = await orchestrator.cancelInFlight("slack:C123");

    expect(result).toEqual({ cancelled: true });
    expect(acpClient.cancelSessionTurn).not.toHaveBeenCalled();
    expect(approvals.cancelForSession).toHaveBeenCalledWith("session-1");
  });
});
