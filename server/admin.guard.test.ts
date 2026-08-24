import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createNonAdminContext(): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "standard-user",
      email: "user@example.com",
      name: "Standard User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "configured-admin",
      email: "admin@example.com",
      name: "Configured Admin",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function createVerificationReviewerContext(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "verification-reviewer",
      email: "reviewer@example.com",
      name: "Verification Reviewer",
      loginMethod: "manus",
      role: "verification_reviewer",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function createModeratorContext(): TrpcContext {
  return {
    user: { id: 8, openId: "moderator", email: "moderator@example.com", name: "Moderator", loginMethod: "manus", role: "moderator", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function createRewardManagerContext(): TrpcContext {
  return {
    user: { id: 9, openId: "reward-manager", email: "rewards@example.com", name: "Reward Manager", loginMethod: "manus", role: "reward_manager", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("admin erişim koruması", () => {
  it("standart kullanıcının yönetici operasyonlarına erişimini reddeder", async () => {
    const caller = appRouter.createCaller(createNonAdminContext());
    await expect(caller.admin.overview()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("yapılandırılmış yönetici izni olan kullanıcının operasyon özetini okuyabildiğini doğrular", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(caller.admin.overview()).resolves.toMatchObject({
      activeTasks: expect.any(Number),
      pendingReviews: expect.any(Number),
    });
  });

  it("doğrulama inceleyicisinin yalnızca kendi izin kapsamındaki kuyruğa eriştiğini doğrular", async () => {
    const caller = appRouter.createCaller(createVerificationReviewerContext());
    await expect(caller.admin.verificationQueue()).resolves.toEqual(expect.any(Array));
    await expect(caller.admin.createReward({ name: "Yetkisiz ödül", pointsCost: 100, stock: 1, deliveryType: "custom", maxPerUser: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("moderatörün risk merkezini okuyabildiğini ancak ödül yazamadığını doğrular", async () => {
    const caller = appRouter.createCaller(createModeratorContext());
    await expect(caller.admin.riskCenter()).resolves.toEqual(expect.any(Array));
    await expect(caller.admin.createReward({ name: "Yetkisiz ödül", pointsCost: 100, stock: 1, deliveryType: "custom", maxPerUser: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("ödül yöneticisinin kataloğu okuyabildiğini ancak doğrulama kuyruğunu açamadığını doğrular", async () => {
    const caller = appRouter.createCaller(createRewardManagerContext());
    await expect(caller.admin.listRewards()).resolves.toEqual(expect.any(Array));
    await expect(caller.admin.verificationQueue()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
