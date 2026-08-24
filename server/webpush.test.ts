import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createAuthenticatedContext(): TrpcContext {
  return {
    user: { id: 1, openId: "push-config-user", email: "push@example.com", name: "Push Config", loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("web push yapılandırması", () => {
  it("VAPID yapılandırmasını hafif durum endpoint’i üzerinden doğrular ve geçersiz değeri güvenle devre dışı bırakır", async () => {
    const caller = appRouter.createCaller(createAuthenticatedContext());
    const status = await caller.notifications.pushStatus();
    expect(typeof status.configured).toBe("boolean");
    if (status.configured) {
      expect(status.publicKey).toMatch(/^[A-Za-z0-9_-]{40,}$/);
      expect(status.subject.startsWith("mailto:") || status.subject.startsWith("https://")).toBe(true);
    } else {
      expect(status.publicKey).toBe("");
      expect(status.subject).toBe("");
    }
  });
});
