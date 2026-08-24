import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const getDbMock = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ getDb: getDbMock }));

const { appRouter } = await import("./routers");

function context(userId = 42): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: userId,
      openId: `notification-user-${userId}`,
      name: "Bildirim Testi",
      email: `notification-${userId}@example.test`,
      loginMethod: "test",
      role: "user",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

beforeEach(() => getDbMock.mockReset());

describe("uygulama içi bildirim işlemleri", () => {
  it("yalnızca oturum sahibinin okunmamış bildirimlerini topluca okundu işaretler", async () => {
    const where = vi.fn().mockResolvedValue([{ affectedRows: 3 }]);
    const set = vi.fn(() => ({ where }));
    getDbMock.mockResolvedValue({ update: vi.fn(() => ({ set })) });

    const result = await appRouter
      .createCaller(context(42))
      .notifications.markAllRead();

    expect(result).toEqual({ updated: 3 });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "read", readAt: expect.any(Date) })
    );
    expect(where).toHaveBeenCalledTimes(1);
  });

  it("yalnızca oturum sahibinin önceden okunmuş bildirimlerini temizler", async () => {
    const where = vi.fn().mockResolvedValue([{ affectedRows: 2 }]);
    getDbMock.mockResolvedValue({ delete: vi.fn(() => ({ where })) });

    const result = await appRouter
      .createCaller(context(42))
      .notifications.clearRead();

    expect(result).toEqual({ deleted: 2 });
    expect(where).toHaveBeenCalledTimes(1);
  });
});
