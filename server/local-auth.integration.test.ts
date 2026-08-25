import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { localAuthCredentials, userProfiles, users } from "../drizzle/schema.js";
import { getDb } from "./db.js";
import { appRouter } from "./routers.js";

const describeReal = process.env.RUN_REAL_DB_INTEGRATION === "1" ? describe : describe.skip;

describeReal("local auth gerçek DB akışı", () => {
  it("kayıt, cookie session, giriş ve duplicate kayıt korumasını tamamlar", async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required");
    const email = `itest_auth_${Date.now()}@example.invalid`;
    const username = `itest_auth_${Date.now()}`;
    const password = "GuvenliParola123";
    const cookies: Array<{ name: string; value: string }> = [];
    const ctx = {
      user: null,
      req: { protocol: "https", headers: {} },
      res: {
        cookie: (name: string, value: string) => cookies.push({ name, value }),
        clearCookie: () => undefined,
      },
    } as any;

    try {
      const caller = appRouter.createCaller(ctx);
      await expect(caller.auth.register({ name: "Integration Auth", username, email, password })).resolves.toEqual({ success: true });
      expect(cookies).toHaveLength(1);
      expect(cookies[0]?.value).toBeTruthy();

      await expect(caller.auth.login({ email: username, password })).resolves.toEqual({ success: true });
      await expect(caller.auth.login({ email, password: "YanlisParola123" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(caller.auth.register({ name: "Duplicate", username, email: email.toUpperCase(), password })).rejects.toMatchObject({ code: "CONFLICT" });

      const [user] = await db.select({ id: users.id, loginMethod: users.loginMethod }).from(users).where(eq(users.email, email)).limit(1);
      expect(user?.loginMethod).toBe("local");
      expect(user?.id).toBeTruthy();
    } finally {
      const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (user) {
        await db.delete(userProfiles).where(eq(userProfiles.userId, user.id));
        await db.delete(localAuthCredentials).where(eq(localAuthCredentials.userId, user.id));
        await db.delete(users).where(and(eq(users.id, user.id), eq(users.email, email)));
      }
    }
  }, 60_000);
});
