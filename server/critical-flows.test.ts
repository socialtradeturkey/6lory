import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { hashSecretCode } from "./domain";
import { encryptYoutubeToken } from "./youtube";

const getDbMock = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ getDb: getDbMock }));

const { appRouter } = await import("./routers");

function createContext(userId = 1): TrpcContext {
  return {
    user: { id: userId, openId: `user-${userId}`, email: `user${userId}@example.com`, name: "Test User", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function query(result: unknown) {
  return {
    limit: async () => result,
    then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
}

function createTransaction(selectResults: unknown[][], insertResults: unknown[] = []) {
  let selectIndex = 0;
  const updates: unknown[] = [];
  const inserts: unknown[] = [];
  const tx = {
    select: () => ({ from: () => ({ where: () => query(selectResults[selectIndex++] ?? []) }) }),
    update: () => ({ set: (values: unknown) => { updates.push(values); return { where: async () => [{ affectedRows: 1 }] }; } }),
    insert: () => ({ values: (values: unknown) => { inserts.push(values); return insertResults.shift() ?? [{ insertId: 1 }]; } }),
  };
  return { tx, updates, inserts };
}

beforeEach(() => getDbMock.mockReset());

describe("kritik görev prosedürleri", () => {
  it("yeni kullanıcı assignment kaydı olmadan aktif görevleri görebilir", async () => {
    const visibleTasks = [
      { id: 1, status: "active", audienceMode: "open", startsAt: null, endsAt: new Date(Date.now() + 60_000) },
      { id: 2, status: "active", audienceMode: "assigned", startsAt: new Date(Date.now() - 60_000), endsAt: null },
    ];
    getDbMock.mockResolvedValue({
      select: () => ({ from: () => ({ where: () => ({ orderBy: async () => visibleTasks }) }) }),
    });

    await expect(appRouter.createCaller(createContext(99)).tasks.list()).resolves.toEqual(visibleTasks);
  });

  it("tasks.start geçerli görevde kotayı bir kez tahsis eder ve imzalı oturum döndürür", async () => {
    const task = { id: 5, status: "active", startsAt: null, endsAt: null, claimedQuota: 0, totalQuota: 2, sessionDurationSeconds: 900 };
    const assignment = { id: 17, status: "claimed" };
    const storedSession = { id: 21, publicId: "stored-session", status: "active" };
    const { tx, updates, inserts } = createTransaction([[], [task], [], [], [assignment], [storedSession]], [[{ insertId: 17 }], [{ insertId: 21 }]]);
    getDbMock.mockResolvedValue({ transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx) });

    const result = await appRouter.createCaller(createContext()).tasks.start({ taskId: 5, idempotencyKey: "start-key-0001" });

    expect(result).toEqual({ session: storedSession, reused: false });
    expect(updates).toContainEqual({ claimedQuota: 1 });
    expect(inserts).toHaveLength(2);
  });

  it("tasks.start mevcut active session’ı yeniden kullanır ve ikinci oturum üretmez", async () => {
    const task = { id: 5, status: "active", startsAt: null, endsAt: null, claimedQuota: 2, totalQuota: 2, sessionDurationSeconds: 900 };
    const activeSession = { id: 21, publicId: "active-session", taskId: 5, userId: 1, status: "active", expiresAt: new Date(Date.now() + 60_000) };
    const { tx, updates, inserts } = createTransaction([[], [task], [activeSession]]);
    getDbMock.mockResolvedValue({ transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx) });

    const result = await appRouter.createCaller(createContext()).tasks.start({ taskId: 5, idempotencyKey: "active-start-key-0001" });

    expect(result).toEqual({ session: activeSession, reused: true });
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("youtube.subscribe yalnızca geçerli YouTube görev session’ı üzerinden resmi API çağrısı yapar", async () => {
    process.env.JWT_SECRET = "critical-youtube-secret";
    const session = { id: 21, publicId: "youtube-session-0001", taskId: 5, userId: 1, status: "active", expiresAt: new Date(Date.now() + 60_000) };
    const task = { id: 5, platform: "youtube", requiresYoutubeSubscription: true, requiresYoutubeLike: false, youtubeChannelId: "UC12345678901234567890", targetUrl: "https://www.youtube.com/watch?v=abc123_XY" };
    const connection = { id: 31, userId: 1, accessTokenCiphertext: encryptYoutubeToken("access-token"), refreshTokenCiphertext: null, expiresAt: new Date(Date.now() + 3_600_000), scopes: ["https://www.googleapis.com/auth/youtube.force-ssl"] };
    let selectIndex = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    getDbMock.mockResolvedValue({
      select: () => ({ from: () => ({ where: () => query([[session], [task], [connection]][selectIndex++]) }) }),
      update: () => ({ set: () => ({ where: async () => [{ affectedRows: 1 }] }) }),
    });

    try {
      await expect(appRouter.createCaller(createContext()).youtube.subscribe({ sessionPublicId: session.publicId })).resolves.toEqual({ subscribed: true, alreadySubscribed: false });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("youtube.verify API eksik sonucunu local ilerleme bayraklarıyla başarıya yükseltmez", async () => {
    process.env.JWT_SECRET = "critical-youtube-secret";
    const connection = { id: 31, userId: 1, accessTokenCiphertext: encryptYoutubeToken("access-token"), refreshTokenCiphertext: null, expiresAt: new Date(Date.now() + 3_600_000), scopes: ["https://www.googleapis.com/auth/youtube.force-ssl"] };
    const session = { id: 21, publicId: "youtube-session-0001", taskId: 5, userId: 1, status: "active", expiresAt: new Date(Date.now() + 60_000), progress: { youtubeSubscribed: true, youtubeLiked: true } };
    const task = { id: 5, platform: "youtube", targetUrl: "https://www.youtube.com/watch?v=abc123_XY", youtubeChannelId: "UC12345678901234567890", requiresYoutubeSubscription: true, requiresYoutubeLike: true };
    const fetchMock = vi.spyOn(globalThis, "fetch");
    for (let attempt = 0; attempt < 4; attempt += 1) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ rating: "none" }] }), { status: 200 }));
    }
    let selectIndex = 0;
    getDbMock.mockResolvedValue({
      select: () => ({ from: () => ({ where: () => query([[connection], [session], [task]][selectIndex++]) }) }),
      update: () => ({ set: () => ({ where: async () => [{ affectedRows: 1 }] }) }),
    });

    try {
      const result = await appRouter.createCaller(createContext()).youtube.verify({ sessionPublicId: session.publicId, videoId: "abc123_XY", channelId: task.youtubeChannelId });
      expect(result).toMatchObject({ subscribed: false, liked: false });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("tasks.start kota dolu olduğunda atama veya oturum yazmaz", async () => {
    const task = { id: 5, status: "active", startsAt: null, endsAt: null, claimedQuota: 2, totalQuota: 2, sessionDurationSeconds: 900 };
    const { tx, updates, inserts } = createTransaction([[], [task], []]);
    getDbMock.mockResolvedValue({ transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx) });

    await expect(appRouter.createCaller(createContext()).tasks.start({ taskId: 5, idempotencyKey: "quota-key-0001" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("tasks.verify aynı idempotency anahtarında mevcut denemeyi döndürür", async () => {
    const existingAttempt = { id: 44, idempotencyKey: "verify-key-0001", status: "pass" };
    const { tx, updates, inserts } = createTransaction([[existingAttempt]]);
    getDbMock.mockResolvedValue({ transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx) });

    const result = await appRouter.createCaller(createContext()).tasks.verify({ sessionPublicId: "session-public-0001", idempotencyKey: "verify-key-0001", signals: { sessionValid: true, activeSeconds: 60, visibilityScore: 100, interactionCount: 2 } });

    expect(result).toEqual({ verification: existingAttempt, idempotent: true });
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("tasks.issueSecretCode başka kullanıcıya ait oturum için kayıt döndürmez", async () => {
    const foreignSession = { id: 2, userId: 99, taskId: 5, status: "active", expiresAt: new Date(Date.now() + 60_000) };
    let selected = false;
    getDbMock.mockResolvedValue({ select: () => ({ from: () => ({ where: () => query(selected ? [] : (selected = true, [foreignSession])) }) }) });

    await expect(appRouter.createCaller(createContext(1)).tasks.issueSecretCode({ sessionPublicId: "foreign-session-0001", signals: { sessionValid: true, activeSeconds: 60, visibilityScore: 100, interactionCount: 2 } })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("tasks.issueSecretCode süresi geçmiş oturum için kod üretmez", async () => {
    const expiredSession = { id: 2, userId: 1, taskId: 5, status: "active", expiresAt: new Date(Date.now() - 1_000) };
    getDbMock.mockResolvedValue({ select: () => ({ from: () => ({ where: () => query([expiredSession]) }) }) });

    await expect(appRouter.createCaller(createContext()).tasks.issueSecretCode({ sessionPublicId: "expired-session-0001", signals: { sessionValid: true, activeSeconds: 60, visibilityScore: 100, interactionCount: 2 } })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("tasks.issueSecretCode geçerli oturumda tek kullanımlık kod üretir", async () => {
    const session = { id: 2, userId: 1, taskId: 5, status: "active", expiresAt: new Date(Date.now() + 60_000) };
    const task = { id: 5, verificationMethod: "secret_code", estimatedDurationSeconds: 60 };
    const updates: unknown[] = [];
    let selectCount = 0;
    getDbMock.mockResolvedValue({
      select: () => ({ from: () => ({ where: () => query(selectCount++ === 0 ? [session] : [task]) }) }),
      update: () => ({ set: (values: unknown) => { updates.push(values); return { where: async () => undefined }; } }),
    });

    const result = await appRouter.createCaller(createContext()).tasks.issueSecretCode({ sessionPublicId: "valid-session-0001", signals: { sessionValid: true, activeSeconds: 60, visibilityScore: 100, interactionCount: 2 } });

    expect(result.code).toMatch(/^\d{6}$/);
    expect(updates).toHaveLength(1);
  });

  it("tasks.verify geçerli Secret Code ile admin onayı bekleyen görev ve pending puan kaydı üretir", async () => {
    const session = { id: 2, userId: 1, taskId: 5, assignmentId: 17, status: "active", expiresAt: new Date(Date.now() + 60_000), secretCodeHash: hashSecretCode("123456"), secretCodeExpiresAt: new Date(Date.now() + 60_000), secretCodeUsedAt: null };
    const task = { id: 5, verificationMethod: "secret_code", estimatedDurationSeconds: 60, rewardPoints: 100 };
    const balance = { availablePoints: 50, lifetimeEarned: 0 };
    const verification = { id: 70, status: "pass" };
    const { tx, updates, inserts } = createTransaction([[], [session], [task], [], [balance], [verification], [verification]], [[{ insertId: 70 }], [], [], []]);
    getDbMock.mockResolvedValue({ transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx) });

    const caller = appRouter.createCaller(createContext());
    const result = await caller.tasks.verify({ sessionPublicId: "verified-session-0001", idempotencyKey: "secret-verify-0001", secretCode: "123456", signals: { sessionValid: true, activeSeconds: 60, visibilityScore: 100, interactionCount: 2 } });
    const replay = await caller.tasks.verify({ sessionPublicId: "verified-session-0001", idempotencyKey: "secret-verify-0001", secretCode: "123456", signals: { sessionValid: true, activeSeconds: 60, visibilityScore: 100, interactionCount: 2 } });

    expect(result.idempotent).toBe(false);
    expect(replay).toEqual({ verification, idempotent: true });
    expect(updates).toContainEqual({ pendingPoints: 100 });
    expect(inserts.filter(value => typeof value === "object" && value && "idempotencyKey" in value && (value as { idempotencyKey: string }).idempotencyKey === "task:70")).toHaveLength(0);
  });

  it("tasks.verify geçersiz Secret Code ile puan veya ledger kaydı oluşturmaz", async () => {
    const session = { id: 2, userId: 1, taskId: 5, assignmentId: 17, status: "active", expiresAt: new Date(Date.now() + 60_000), secretCodeHash: hashSecretCode("123456"), secretCodeExpiresAt: new Date(Date.now() + 60_000), secretCodeUsedAt: null };
    const task = { id: 5, verificationMethod: "secret_code", estimatedDurationSeconds: 60, rewardPoints: 100 };
    const verification = { id: 71, status: "fail" };
    const { tx, updates, inserts } = createTransaction([[], [session], [task], [verification]], [[{ insertId: 71 }], [], []]);
    getDbMock.mockResolvedValue({ transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx) });

    const result = await appRouter.createCaller(createContext()).tasks.verify({ sessionPublicId: "invalid-code-session", idempotencyKey: "invalid-code-0001", secretCode: "654321", signals: { sessionValid: true, activeSeconds: 60, visibilityScore: 100, interactionCount: 2 } });

    expect(result.idempotent).toBe(false);
    expect(inserts.some(value => typeof value === "object" && value && "type" in value && (value as { type: string }).type === "task_reward")).toBe(false);
    expect(updates).not.toContainEqual(expect.objectContaining({ availablePoints: expect.any(Number) }));
  });

  it.each([
    ["foreign", { userId: 99, expiresAt: new Date(Date.now() + 60_000) }],
    ["expired", { userId: 1, expiresAt: new Date(Date.now() - 1_000) }],
  ])("tasks.verify %s oturumunu reddeder", async (_label, patch) => {
    const session = { id: 2, userId: 1, taskId: 5, assignmentId: 17, status: "active", expiresAt: new Date(Date.now() + 60_000), secretCodeHash: null, secretCodeExpiresAt: null, secretCodeUsedAt: null, ...patch };
    const { tx, updates, inserts } = createTransaction([[], [session]]);
    getDbMock.mockResolvedValue({ transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx) });

    await expect(appRouter.createCaller(createContext()).tasks.verify({ sessionPublicId: `${_label}-session-0001`, idempotencyKey: `${_label}-verify-0001`, signals: { sessionValid: true, activeSeconds: 60, visibilityScore: 100, interactionCount: 2 } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });
});

describe("kritik ödül prosedürleri", () => {
  it("rewards.redeem başarılı talepte stok ve bakiye projeksiyonunu bir kez günceller", async () => {
    const reward = { id: 8, status: "active", name: "Hediye", pointsCost: 100, stock: 5, maxPerUser: 1 };
    const balance = { availablePoints: 500, lifetimeSpent: 20 };
    const trust = { score: 70, status: "normal" };
    const redemption = { id: 66, rewardId: 8, userId: 1, pointsCost: 100 };
    const { tx, updates, inserts } = createTransaction([[], [reward], [balance], [trust], [], [redemption]], [[{ insertId: 66 }], [], []]);
    getDbMock.mockResolvedValue({ transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx) });

    const result = await appRouter.createCaller(createContext()).rewards.redeem({ rewardId: 8, idempotencyKey: "redeem-key-0001" });

    expect(result).toEqual({ redemption, idempotent: false });
    expect(updates).toContainEqual({ stock: 4 });
    expect(updates).toContainEqual({ availablePoints: 400, lifetimeSpent: 120 });
    expect(inserts).toContainEqual(expect.objectContaining({ idempotencyKey: "redeem:redeem-key-0001", amount: -100, balanceAfter: 400 }));
  });

  it("rewards.redeem aynı idempotency anahtarında ikinci puan düşümünü yapmaz", async () => {
    const existingRedemption = { id: 66, idempotencyKey: "redeem-key-0001", status: "requested" };
    const { tx, updates, inserts } = createTransaction([[existingRedemption]]);
    getDbMock.mockResolvedValue({ transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx) });

    const result = await appRouter.createCaller(createContext()).rewards.redeem({ rewardId: 8, idempotencyKey: "redeem-key-0001" });

    expect(result).toEqual({ redemption: existingRedemption, idempotent: true });
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it.each([
    ["stok yok", { stock: 0 }, { availablePoints: 500 }, { status: "normal" }, [], "REWARD_OUT_OF_STOCK"],
    ["kullanıcı limiti", {}, { availablePoints: 500 }, { status: "normal" }, [{ id: 1 }], "REWARD_USER_LIMIT_REACHED"],
    ["yüksek risk", {}, { availablePoints: 500 }, { status: "restricted" }, [], "RISK_REVIEW_REQUIRED"],
    ["askıya alınmış risk", {}, { availablePoints: 500 }, { status: "suspended" }, [], "RISK_REVIEW_REQUIRED"],
    ["yetersiz puan", {}, { availablePoints: 50 }, { status: "normal" }, [], "INSUFFICIENT_POINTS"],
  ])("rewards.redeem %s durumunda puan veya stok yazmaz", async (_label, rewardPatch, balancePatch, trustPatch, priorRedemptions) => {
    const reward = { id: 8, status: "active", pointsCost: 100, stock: 5, maxPerUser: 1, ...rewardPatch };
    const balance = { availablePoints: 500, lifetimeSpent: 0, ...balancePatch };
    const trust = { score: 70, status: "normal", ...trustPatch };
    const { tx, updates, inserts } = createTransaction([[], [reward], [balance], [trust], priorRedemptions as unknown[]]);
    getDbMock.mockResolvedValue({ transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx) });

    await expect(appRouter.createCaller(createContext()).rewards.redeem({ rewardId: 8, idempotencyKey: `reject-key-${_label}`.padEnd(12, "0") })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });
});

describe("kullanıcı kazanım yolculuğu", () => {
  it("görev başlatma, Secret Code doğrulaması ve ödül talebini tek kullanıcı sözleşmesinde tamamlar", async () => {
    const startTask = { id: 5, status: "active", startsAt: null, endsAt: null, claimedQuota: 0, totalQuota: 2, sessionDurationSeconds: 900 };
    const assignment = { id: 17, status: "claimed" };
    const startedSession = { id: 21, publicId: "journey-session-0001", status: "active" };
    const start = createTransaction([[], [startTask], [], [assignment], [startedSession]], [[{ insertId: 17 }], [{ insertId: 21 }]]);

    const activeSession = { id: 21, userId: 1, taskId: 5, assignmentId: 17, status: "active", expiresAt: new Date(Date.now() + 60_000), secretCodeHash: hashSecretCode("112233"), secretCodeExpiresAt: new Date(Date.now() + 60_000), secretCodeUsedAt: null };
    const verifiedTask = { id: 5, verificationMethod: "secret_code", estimatedDurationSeconds: 60, rewardPoints: 100 };
    const balanceBeforeReward = { availablePoints: 100, lifetimeEarned: 0 };
    const verifiedAttempt = { id: 70, status: "pass" };
    const verify = createTransaction([[], [activeSession], [verifiedTask], [], [balanceBeforeReward], [verifiedAttempt]], [[{ insertId: 70 }], [], [], []]);

    const reward = { id: 8, status: "active", name: "Hediye", pointsCost: 100, stock: 5, maxPerUser: 1 };
    const balanceBeforeRedemption = { availablePoints: 200, lifetimeSpent: 0 };
    const normalTrust = { score: 70, status: "normal" };
    const redemption = { id: 66, rewardId: 8, userId: 1, pointsCost: 100 };
    const redeem = createTransaction([[], [reward], [balanceBeforeRedemption], [normalTrust], [], [redemption]], [[{ insertId: 66 }], [], []]);

    getDbMock
      .mockResolvedValueOnce({ transaction: async (callback: (transaction: typeof start.tx) => unknown) => callback(start.tx) })
      .mockResolvedValueOnce({ transaction: async (callback: (transaction: typeof verify.tx) => unknown) => callback(verify.tx) })
      .mockResolvedValueOnce({ transaction: async (callback: (transaction: typeof redeem.tx) => unknown) => callback(redeem.tx) });

    const caller = appRouter.createCaller(createContext());
    const sessionResult = await caller.tasks.start({ taskId: 5, idempotencyKey: "journey-start-0001" });
    const verificationResult = await caller.tasks.verify({ sessionPublicId: sessionResult.session!.publicId, idempotencyKey: "journey-verify-0001", secretCode: "112233", signals: { sessionValid: true, activeSeconds: 60, visibilityScore: 100, interactionCount: 2 } });
    const redemptionResult = await caller.rewards.redeem({ rewardId: 8, idempotencyKey: "journey-redeem-0001" });

    expect(sessionResult.reused).toBe(false);
    expect(verificationResult.idempotent).toBe(false);
    expect(redemptionResult.idempotent).toBe(false);
    expect(verify.inserts).not.toContainEqual(expect.objectContaining({ type: "task_reward", amount: 100 }));
    expect(redeem.inserts).toContainEqual(expect.objectContaining({ type: "reward_redemption", amount: -100 }));
  });
});
