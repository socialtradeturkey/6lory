import {
  bigint,
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

const utcTimestamp = () => timestamp({ mode: "date" });

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "moderator", "verification_reviewer", "reward_manager"])
    .default("user")
    .notNull(),
  accountStatus: mysqlEnum("account_status", ["active", "blocked", "deleted"]).default("active").notNull(),
  createdAt: utcTimestamp().defaultNow().notNull(),
  updatedAt: utcTimestamp().defaultNow().onUpdateNow().notNull(),
  lastSignedIn: utcTimestamp().defaultNow().notNull(),
});

export const localAuthCredentials = mysqlTable(
  "local_auth_credentials",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: varchar("password_salt", { length: 128 }).notNull(),
    failedAttempts: int("failed_attempts").default(0).notNull(),
    lockedUntil: timestamp("locked_until"),
    createdAt: utcTimestamp().defaultNow().notNull(),
    updatedAt: utcTimestamp().defaultNow().onUpdateNow().notNull(),
  },
  table => [index("local_auth_email_idx").on(table.email)],
);

export const userProfiles = mysqlTable(
  "user_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
    username: varchar("username", { length: 48 }).notNull().unique(),
    displayName: varchar("display_name", { length: 96 }),
    avatarUrl: varchar("avatar_url", { length: 1024 }),
    countryCode: varchar("country_code", { length: 2 }),
    onboardingStatus: mysqlEnum("onboarding_status", ["pending", "completed", "restricted"]).default("pending").notNull(),
    termsAcceptedAt: utcTimestamp(),
    privacyAcceptedAt: utcTimestamp(),
    pushEnabled: boolean("push_enabled").default(false).notNull(),
    createdAt: utcTimestamp().defaultNow().notNull(),
    updatedAt: utcTimestamp().defaultNow().onUpdateNow().notNull(),
  },
  table => [index("user_profiles_user_idx").on(table.userId)],
);

export const roleDefinitions = mysqlTable("role_definitions", {
  id: int("id").autoincrement().primaryKey(),
  code: mysqlEnum("code", ["user", "admin", "moderator", "verification_reviewer", "reward_manager"]).notNull().unique(),
  label: varchar("label", { length: 96 }).notNull(),
  description: text("description"),
  isSystem: boolean("is_system").default(true).notNull(),
  createdAt: utcTimestamp().defaultNow().notNull(),
  updatedAt: utcTimestamp().defaultNow().onUpdateNow().notNull(),
});

export const rolePermissions = mysqlTable(
  "role_permissions",
  {
    id: int("id").autoincrement().primaryKey(),
    roleCode: mysqlEnum("role_code", ["user", "admin", "moderator", "verification_reviewer", "reward_manager"]).notNull(),
    permission: varchar("permission", { length: 128 }).notNull(),
    createdAt: utcTimestamp().defaultNow().notNull(),
  },
  table => [uniqueIndex("role_permission_unique").on(table.roleCode, table.permission)],
);

export const campaigns = mysqlTable(
  "campaigns",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    status: mysqlEnum("status", ["draft", "scheduled", "active", "paused", "archived"]).default("draft").notNull(),
    pointBudget: bigint("point_budget", { mode: "number" }),
    startsAt: utcTimestamp(),
    endsAt: utcTimestamp(),
    createdBy: int("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: utcTimestamp().defaultNow().notNull(),
    updatedAt: utcTimestamp().defaultNow().onUpdateNow().notNull(),
  },
  table => [index("campaigns_status_window_idx").on(table.status, table.startsAt, table.endsAt)],
);

export const commentPools = mysqlTable(
  "comment_pools",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    category: varchar("category", { length: 96 }),
    language: varchar("language", { length: 16 }).default("tr").notNull(),
    perUserReuseHours: int("per_user_reuse_hours").default(168).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdBy: int("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: utcTimestamp().defaultNow().notNull(),
    updatedAt: utcTimestamp().defaultNow().onUpdateNow().notNull(),
  },
  table => [index("comment_pools_active_idx").on(table.isActive, table.language)],
);

export const comments = mysqlTable(
  "comments",
  {
    id: int("id").autoincrement().primaryKey(),
    poolId: int("pool_id").notNull().references(() => commentPools.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    weight: int("weight").default(1).notNull(),
    maxUses: int("max_uses"),
    usedCount: int("used_count").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: utcTimestamp().defaultNow().notNull(),
    updatedAt: utcTimestamp().defaultNow().onUpdateNow().notNull(),
  },
  table => [index("comments_pool_active_idx").on(table.poolId, table.isActive)],
);

export const tasks = mysqlTable(
  "tasks",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    platform: mysqlEnum("platform", ["web", "instagram", "youtube", "tiktok", "custom"]).notNull(),
    actionType: varchar("action_type", { length: 64 }).notNull(),
    targetUrl: varchar("target_url", { length: 2048 }),
    targetIdentifier: varchar("target_identifier", { length: 255 }),
    rewardPoints: int("reward_points").notNull(),
    totalQuota: int("total_quota").notNull(),
    claimedQuota: int("claimed_quota").default(0).notNull(),
    perUserLimit: int("per_user_limit").default(1).notNull(),
    audienceMode: mysqlEnum("audience_mode", ["open", "assigned"]).default("open").notNull(),
    assignmentTargetCount: int("assignment_target_count"),
    status: mysqlEnum("status", ["draft", "scheduled", "active", "paused", "ended", "archived"]).default("draft").notNull(),
    priority: int("priority").default(0).notNull(),
    verificationMethod: mysqlEnum("verification_method", ["web_signals", "secret_code", "manual_review", "platform_api", "platform_api_manual_fallback"]).notNull(),
    fallbackMethod: mysqlEnum("fallback_method", ["none", "manual_review", "unavailable"]).default("none").notNull(),
    estimatedDurationSeconds: int("estimated_duration_seconds").default(30).notNull(),
    requiredWatchSeconds: int("required_watch_seconds").default(30).notNull(),
    secretCodeDisplaySeconds: int("secret_code_display_seconds").default(12).notNull(),
    secretCodeRandomMinSeconds: int("secret_code_random_min_seconds").default(30).notNull(),
    secretCodeRandomMaxSeconds: int("secret_code_random_max_seconds").default(60).notNull(),
    sessionDurationSeconds: int("session_duration_seconds").default(900).notNull(),
    instructions: json("instructions").$type<string[]>().notNull(),
    eligibilityRules: json("eligibility_rules").$type<Record<string, unknown>>(),
    commentPoolId: int("comment_pool_id").references(() => commentPools.id, { onDelete: "set null" }),
    startsAt: utcTimestamp(),
    endsAt: utcTimestamp(),
    createdBy: int("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: utcTimestamp().defaultNow().notNull(),
    updatedAt: utcTimestamp().defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("tasks_discovery_idx").on(table.status, table.platform, table.priority),
    index("tasks_campaign_idx").on(table.campaignId),
    index("tasks_window_idx").on(table.startsAt, table.endsAt),
  ],
);

export const socialAccounts = mysqlTable(
  "social_accounts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    platform: mysqlEnum("platform", ["instagram", "youtube", "tiktok"]).notNull(),
    username: varchar("username", { length: 160 }).notNull(),
    platformUserId: varchar("platform_user_id", { length: 255 }),
    verificationCodeHash: varchar("verification_code_hash", { length: 255 }),
    verificationStatus: mysqlEnum("verification_status", ["pending", "verified", "rejected", "unavailable"]).default("pending").notNull(),
    verificationMethod: varchar("verification_method", { length: 64 }),
    verifiedAt: utcTimestamp(),
    lastCheckedAt: utcTimestamp(),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: utcTimestamp().defaultNow().notNull(),
    updatedAt: utcTimestamp().defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("social_accounts_user_platform_username_unique").on(table.userId, table.platform, table.username),
    index("social_accounts_user_status_idx").on(table.userId, table.verificationStatus),
  ],
);

export const taskAssignments = mysqlTable(
  "task_assignments",
  {
    id: int("id").autoincrement().primaryKey(),
    taskId: int("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", ["assigned", "started", "completed", "expired", "cancelled"]).default("assigned").notNull(),
    notificationStatus: mysqlEnum("notification_status", ["not_sent", "sent", "failed"]).default("not_sent").notNull(),
    assignedAt: utcTimestamp().defaultNow().notNull(),
    expiresAt: utcTimestamp(),
    completedAt: utcTimestamp(),
  },
  table => [
    uniqueIndex("task_assignments_task_user_unique").on(table.taskId, table.userId),
    index("task_assignments_user_status_idx").on(table.userId, table.status, table.expiresAt),
  ],
);

export const taskSessions = mysqlTable(
  "task_sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    publicId: varchar("public_id", { length: 64 }).notNull().unique(),
    startIdempotencyKey: varchar("start_idempotency_key", { length: 96 }).notNull().unique(),
    taskId: int("task_id").notNull().references(() => tasks.id, { onDelete: "restrict" }),
    assignmentId: int("assignment_id").notNull().references(() => taskAssignments.id, { onDelete: "restrict" }),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    signedReferenceHash: varchar("signed_reference_hash", { length: 255 }).notNull(),
    status: mysqlEnum("status", ["created", "active", "paused", "pending_verification", "verified", "rejected", "expired", "cancelled"]).default("created").notNull(),
    verificationState: mysqlEnum("verification_state", ["not_requested", "pending", "passed", "failed", "manual_review", "unavailable"]).default("not_requested").notNull(),
    startedAt: utcTimestamp().defaultNow().notNull(),
    expiresAt: utcTimestamp().notNull(),
    completedAt: utcTimestamp(),
    lastHeartbeatAt: utcTimestamp(),
    progress: json("progress").$type<Record<string, unknown>>(),
    secretCodeHash: varchar("secret_code_hash", { length: 255 }),
    secretCodeExpiresAt: utcTimestamp(),
    secretCodeUsedAt: utcTimestamp(),
    createdAt: utcTimestamp().defaultNow().notNull(),
    updatedAt: utcTimestamp().defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("task_sessions_user_status_idx").on(table.userId, table.status, table.expiresAt),
    index("task_sessions_task_user_idx").on(table.taskId, table.userId),
  ],
);

export const verificationAttempts = mysqlTable(
  "verification_attempts",
  {
    id: int("id").autoincrement().primaryKey(),
    idempotencyKey: varchar("idempotency_key", { length: 96 }).notNull().unique(),
    taskId: int("task_id").notNull().references(() => tasks.id, { onDelete: "restrict" }),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    sessionId: int("session_id").notNull().references(() => taskSessions.id, { onDelete: "restrict" }),
    adapter: varchar("adapter", { length: 96 }).notNull(),
    status: mysqlEnum("status", ["pending", "pass", "fail", "unavailable", "manual_review"]).default("pending").notNull(),
    score: int("score"),
    reason: text("reason"),
    externalReference: varchar("external_reference", { length: 255 }),
    startedAt: utcTimestamp().defaultNow().notNull(),
    completedAt: utcTimestamp(),
    createdAt: utcTimestamp().defaultNow().notNull(),
  },
  table => [index("verification_attempts_session_idx").on(table.sessionId, table.status)],
);

export const verificationSignals = mysqlTable(
  "verification_signals",
  {
    id: int("id").autoincrement().primaryKey(),
    verificationAttemptId: int("verification_attempt_id").notNull().references(() => verificationAttempts.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 96 }).notNull(),
    value: json("value").$type<unknown>(),
    score: int("score"),
    createdAt: utcTimestamp().defaultNow().notNull(),
  },
  table => [index("verification_signals_attempt_idx").on(table.verificationAttemptId)],
);

export const manualReviews = mysqlTable(
  "manual_reviews",
  {
    id: int("id").autoincrement().primaryKey(),
    verificationAttemptId: int("verification_attempt_id").notNull().unique().references(() => verificationAttempts.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", ["pending", "approved", "rejected", "retry_requested"]).default("pending").notNull(),
    reviewerId: int("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    decisionReason: text("decision_reason"),
    decidedAt: utcTimestamp(),
    createdAt: utcTimestamp().defaultNow().notNull(),
  },
  table => [index("manual_reviews_status_idx").on(table.status, table.createdAt)],
);

export const rewards = mysqlTable(
  "rewards",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    imageUrl: varchar("image_url", { length: 1024 }),
    pointsCost: int("points_cost").notNull(),
    stock: int("stock").notNull(),
    status: mysqlEnum("status", ["draft", "active", "paused", "archived"]).default("draft").notNull(),
    category: varchar("category", { length: 96 }),
    deliveryType: mysqlEnum("delivery_type", ["digital", "physical", "coupon", "gift_card", "custom"]).notNull(),
    maxPerUser: int("max_per_user").default(1).notNull(),
    createdAt: utcTimestamp().defaultNow().notNull(),
    updatedAt: utcTimestamp().defaultNow().onUpdateNow().notNull(),
  },
  table => [index("rewards_catalog_idx").on(table.status, table.category, table.pointsCost)],
);

export const rewardRedemptions = mysqlTable(
  "reward_redemptions",
  {
    id: int("id").autoincrement().primaryKey(),
    idempotencyKey: varchar("idempotency_key", { length: 96 }).notNull().unique(),
    rewardId: int("reward_id").notNull().references(() => rewards.id, { onDelete: "restrict" }),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    pointsCost: int("points_cost").notNull(),
    status: mysqlEnum("status", ["requested", "under_review", "approved", "preparing", "shipped", "delivered", "rejected", "cancelled"]).default("requested").notNull(),
    riskSnapshot: json("risk_snapshot").$type<Record<string, unknown>>(),
    fulfillmentData: json("fulfillment_data").$type<Record<string, unknown>>(),
    processedBy: int("processed_by").references(() => users.id, { onDelete: "set null" }),
    processedAt: utcTimestamp(),
    createdAt: utcTimestamp().defaultNow().notNull(),
    updatedAt: utcTimestamp().defaultNow().onUpdateNow().notNull(),
  },
  table => [index("reward_redemptions_operational_idx").on(table.status, table.createdAt)],
);

export const pointLedger = mysqlTable(
  "point_ledger",
  {
    id: int("id").autoincrement().primaryKey(),
    idempotencyKey: varchar("idempotency_key", { length: 96 }).notNull().unique(),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    type: mysqlEnum("type", ["task_reward", "reward_redemption", "admin_adjustment", "reversal"]).notNull(),
    amount: int("amount").notNull(),
    taskId: int("task_id").references(() => tasks.id, { onDelete: "set null" }),
    verificationAttemptId: int("verification_attempt_id").references(() => verificationAttempts.id, { onDelete: "set null" }),
    rewardRedemptionId: int("reward_redemption_id").references(() => rewardRedemptions.id, { onDelete: "set null" }),
    balanceAfter: int("balance_after").notNull(),
    reason: varchar("reason", { length: 255 }).notNull(),
    createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: utcTimestamp().defaultNow().notNull(),
  },
  table => [
    uniqueIndex("point_ledger_successful_task_reward_unique").on(table.userId, table.taskId, table.verificationAttemptId),
    index("point_ledger_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const pointBalances = mysqlTable("point_balances", {
  userId: int("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  availablePoints: int("available_points").default(0).notNull(),
  pendingPoints: int("pending_points").default(0).notNull(),
  lifetimeEarned: int("lifetime_earned").default(0).notNull(),
  lifetimeSpent: int("lifetime_spent").default(0).notNull(),
  updatedAt: utcTimestamp().defaultNow().onUpdateNow().notNull(),
});

export const trustScores = mysqlTable("trust_scores", {
  userId: int("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  score: int("score").default(50).notNull(),
  status: mysqlEnum("status", ["normal", "watch", "review", "restricted", "suspended"]).default("normal").notNull(),
  factors: json("factors").$type<Record<string, number>>(),
  calculatedAt: utcTimestamp().defaultNow().notNull(),
  updatedAt: utcTimestamp().defaultNow().onUpdateNow().notNull(),
});

export const riskEvents = mysqlTable(
  "risk_events",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 96 }).notNull(),
    severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).notNull(),
    details: json("details").$type<Record<string, unknown>>(),
    resolvedAt: utcTimestamp(),
    createdAt: utcTimestamp().defaultNow().notNull(),
  },
  table => [index("risk_events_user_idx").on(table.userId, table.severity, table.createdAt)],
);

export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 64 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    body: text("body").notNull(),
    destination: varchar("destination", { length: 512 }),
    status: mysqlEnum("status", ["unread", "read", "archived"]).default("unread").notNull(),
    createdAt: utcTimestamp().defaultNow().notNull(),
    readAt: utcTimestamp(),
  },
  table => [index("notifications_inbox_idx").on(table.userId, table.status, table.createdAt)],
);

export const webPushSubscriptions = mysqlTable(
  "web_push_subscriptions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    endpoint: varchar("endpoint", { length: 2048 }).notNull().unique(),
    publicKey: text("public_key").notNull(),
    authSecret: text("auth_secret").notNull(),
    userAgent: varchar("user_agent", { length: 512 }),
    revokedAt: utcTimestamp(),
    createdAt: utcTimestamp().defaultNow().notNull(),
    updatedAt: utcTimestamp().defaultNow().onUpdateNow().notNull(),
  },
  table => [index("web_push_subscriptions_user_idx").on(table.userId, table.revokedAt)],
);

export const notificationDeliveries = mysqlTable(
  "notification_deliveries",
  {
    id: int("id").autoincrement().primaryKey(),
    notificationId: int("notification_id").notNull().references(() => notifications.id, { onDelete: "cascade" }),
    subscriptionId: int("subscription_id").references(() => webPushSubscriptions.id, { onDelete: "set null" }),
    channel: mysqlEnum("channel", ["in_app", "web_push"]).notNull(),
    status: mysqlEnum("status", ["queued", "sent", "failed"]).default("queued").notNull(),
    retryCount: int("retry_count").default(0).notNull(),
    scheduledAt: utcTimestamp().defaultNow().notNull(),
    sentAt: utcTimestamp(),
    errorCode: varchar("error_code", { length: 96 }),
  },
  table => [index("notification_deliveries_queue_idx").on(table.status, table.scheduledAt)],
);

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    actorUserId: int("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 128 }).notNull(),
    entityType: varchar("entity_type", { length: 96 }).notNull(),
    entityId: varchar("entity_id", { length: 96 }),
    beforeState: json("before_state").$type<Record<string, unknown>>(),
    afterState: json("after_state").$type<Record<string, unknown>>(),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: utcTimestamp().defaultNow().notNull(),
  },
  table => [index("audit_logs_entity_idx").on(table.entityType, table.entityId, table.createdAt)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type TaskSession = typeof taskSessions.$inferSelect;
export type VerificationAttempt = typeof verificationAttempts.$inferSelect;
export type PointLedgerEntry = typeof pointLedger.$inferSelect;
export type Reward = typeof rewards.$inferSelect;
export type RoleDefinition = typeof roleDefinitions.$inferSelect;
