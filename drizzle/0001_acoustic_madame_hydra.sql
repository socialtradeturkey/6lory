CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actor_user_id` int,
	`action` varchar(128) NOT NULL,
	`entity_type` varchar(96) NOT NULL,
	`entity_id` varchar(96),
	`before_state` json,
	`after_state` json,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`status` enum('draft','scheduled','active','paused','archived') NOT NULL DEFAULT 'draft',
	`point_budget` bigint,
	`startsAt` timestamp,
	`endsAt` timestamp,
	`created_by` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `comment_pools` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`category` varchar(96),
	`language` varchar(16) NOT NULL DEFAULT 'tr',
	`per_user_reuse_hours` int NOT NULL DEFAULT 168,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `comment_pools_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pool_id` int NOT NULL,
	`body` text NOT NULL,
	`weight` int NOT NULL DEFAULT 1,
	`max_uses` int,
	`used_count` int NOT NULL DEFAULT 0,
	`is_active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `manual_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`verification_attempt_id` int NOT NULL,
	`status` enum('pending','approved','rejected','retry_requested') NOT NULL DEFAULT 'pending',
	`reviewer_id` int,
	`decision_reason` text,
	`decidedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `manual_reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `manual_reviews_verification_attempt_id_unique` UNIQUE(`verification_attempt_id`)
);
--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`notification_id` int NOT NULL,
	`subscription_id` int,
	`channel` enum('in_app','web_push') NOT NULL,
	`status` enum('queued','sent','failed') NOT NULL DEFAULT 'queued',
	`retry_count` int NOT NULL DEFAULT 0,
	`scheduledAt` timestamp NOT NULL DEFAULT (now()),
	`sentAt` timestamp,
	`error_code` varchar(96),
	CONSTRAINT `notification_deliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`type` varchar(64) NOT NULL,
	`title` varchar(160) NOT NULL,
	`body` text NOT NULL,
	`destination` varchar(512),
	`status` enum('unread','read','archived') NOT NULL DEFAULT 'unread',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`readAt` timestamp,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `point_balances` (
	`user_id` int NOT NULL,
	`available_points` int NOT NULL DEFAULT 0,
	`pending_points` int NOT NULL DEFAULT 0,
	`lifetime_earned` int NOT NULL DEFAULT 0,
	`lifetime_spent` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `point_balances_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `point_ledger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`idempotency_key` varchar(96) NOT NULL,
	`user_id` int NOT NULL,
	`type` enum('task_reward','reward_redemption','admin_adjustment','reversal') NOT NULL,
	`amount` int NOT NULL,
	`task_id` int,
	`verification_attempt_id` int,
	`reward_redemption_id` int,
	`balance_after` int NOT NULL,
	`reason` varchar(255) NOT NULL,
	`created_by` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `point_ledger_id` PRIMARY KEY(`id`),
	CONSTRAINT `point_ledger_idempotency_key_unique` UNIQUE(`idempotency_key`),
	CONSTRAINT `point_ledger_successful_task_reward_unique` UNIQUE(`user_id`,`task_id`,`verification_attempt_id`)
);
--> statement-breakpoint
CREATE TABLE `reward_redemptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`idempotency_key` varchar(96) NOT NULL,
	`reward_id` int NOT NULL,
	`user_id` int NOT NULL,
	`points_cost` int NOT NULL,
	`status` enum('requested','under_review','approved','preparing','shipped','delivered','rejected','cancelled') NOT NULL DEFAULT 'requested',
	`risk_snapshot` json,
	`fulfillment_data` json,
	`processed_by` int,
	`processedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reward_redemptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `reward_redemptions_idempotency_key_unique` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `rewards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`image_url` varchar(1024),
	`points_cost` int NOT NULL,
	`stock` int NOT NULL,
	`status` enum('draft','active','paused','archived') NOT NULL DEFAULT 'draft',
	`category` varchar(96),
	`delivery_type` enum('digital','physical','coupon','gift_card','custom') NOT NULL,
	`max_per_user` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rewards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `risk_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`type` varchar(96) NOT NULL,
	`severity` enum('low','medium','high','critical') NOT NULL,
	`details` json,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `risk_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `social_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`platform` enum('instagram','youtube','tiktok') NOT NULL,
	`username` varchar(160) NOT NULL,
	`platform_user_id` varchar(255),
	`verification_code_hash` varchar(255),
	`verification_status` enum('pending','verified','rejected','unavailable') NOT NULL DEFAULT 'pending',
	`verification_method` varchar(64),
	`verifiedAt` timestamp,
	`lastCheckedAt` timestamp,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `social_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `social_accounts_user_platform_username_unique` UNIQUE(`user_id`,`platform`,`username`)
);
--> statement-breakpoint
CREATE TABLE `task_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`task_id` int NOT NULL,
	`user_id` int NOT NULL,
	`status` enum('assigned','started','completed','expired','cancelled') NOT NULL DEFAULT 'assigned',
	`notification_status` enum('not_sent','sent','failed') NOT NULL DEFAULT 'not_sent',
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	`completedAt` timestamp,
	CONSTRAINT `task_assignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_assignments_task_user_unique` UNIQUE(`task_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `task_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`public_id` varchar(64) NOT NULL,
	`task_id` int NOT NULL,
	`assignment_id` int NOT NULL,
	`user_id` int NOT NULL,
	`signed_reference_hash` varchar(255) NOT NULL,
	`status` enum('created','active','paused','pending_verification','verified','rejected','expired','cancelled') NOT NULL DEFAULT 'created',
	`verification_state` enum('not_requested','pending','passed','failed','manual_review','unavailable') NOT NULL DEFAULT 'not_requested',
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`completedAt` timestamp,
	`lastHeartbeatAt` timestamp,
	`progress` json,
	`secret_code_hash` varchar(255),
	`secretCodeExpiresAt` timestamp,
	`secretCodeUsedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `task_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_sessions_public_id_unique` UNIQUE(`public_id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaign_id` int,
	`title` varchar(200) NOT NULL,
	`description` text,
	`platform` enum('web','instagram','youtube','tiktok','custom') NOT NULL,
	`action_type` varchar(64) NOT NULL,
	`target_url` varchar(2048),
	`target_identifier` varchar(255),
	`reward_points` int NOT NULL,
	`total_quota` int NOT NULL,
	`claimed_quota` int NOT NULL DEFAULT 0,
	`per_user_limit` int NOT NULL DEFAULT 1,
	`status` enum('draft','scheduled','active','paused','ended','archived') NOT NULL DEFAULT 'draft',
	`priority` int NOT NULL DEFAULT 0,
	`verification_method` enum('web_signals','secret_code','manual_review','platform_api','platform_api_manual_fallback') NOT NULL,
	`fallback_method` enum('none','manual_review','unavailable') NOT NULL DEFAULT 'none',
	`estimated_duration_seconds` int NOT NULL DEFAULT 30,
	`session_duration_seconds` int NOT NULL DEFAULT 900,
	`instructions` json NOT NULL,
	`eligibility_rules` json,
	`comment_pool_id` int,
	`startsAt` timestamp,
	`endsAt` timestamp,
	`created_by` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trust_scores` (
	`user_id` int NOT NULL,
	`score` int NOT NULL DEFAULT 50,
	`status` enum('normal','watch','review','restricted','suspended') NOT NULL DEFAULT 'normal',
	`factors` json,
	`calculatedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trust_scores_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`username` varchar(48) NOT NULL,
	`display_name` varchar(96),
	`avatar_url` varchar(1024),
	`country_code` varchar(2),
	`onboarding_status` enum('pending','completed','restricted') NOT NULL DEFAULT 'pending',
	`termsAcceptedAt` timestamp,
	`privacyAcceptedAt` timestamp,
	`push_enabled` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_profiles_user_id_unique` UNIQUE(`user_id`),
	CONSTRAINT `user_profiles_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `verification_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`idempotency_key` varchar(96) NOT NULL,
	`task_id` int NOT NULL,
	`user_id` int NOT NULL,
	`session_id` int NOT NULL,
	`adapter` varchar(96) NOT NULL,
	`status` enum('pending','pass','fail','unavailable','manual_review') NOT NULL DEFAULT 'pending',
	`score` int,
	`reason` text,
	`external_reference` varchar(255),
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `verification_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `verification_attempts_idempotency_key_unique` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `verification_signals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`verification_attempt_id` int NOT NULL,
	`key` varchar(96) NOT NULL,
	`value` json,
	`score` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `verification_signals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `web_push_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`endpoint` varchar(2048) NOT NULL,
	`public_key` text NOT NULL,
	`auth_secret` text NOT NULL,
	`user_agent` varchar(512),
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `web_push_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `web_push_subscriptions_endpoint_unique` UNIQUE(`endpoint`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','moderator','verification_reviewer','reward_manager') NOT NULL DEFAULT 'user';--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`,`createdAt`);--> statement-breakpoint
CREATE INDEX `campaigns_status_window_idx` ON `campaigns` (`status`,`startsAt`,`endsAt`);--> statement-breakpoint
CREATE INDEX `comment_pools_active_idx` ON `comment_pools` (`is_active`,`language`);--> statement-breakpoint
CREATE INDEX `comments_pool_active_idx` ON `comments` (`pool_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `manual_reviews_status_idx` ON `manual_reviews` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_queue_idx` ON `notification_deliveries` (`status`,`scheduledAt`);--> statement-breakpoint
CREATE INDEX `notifications_inbox_idx` ON `notifications` (`user_id`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `point_ledger_user_created_idx` ON `point_ledger` (`user_id`,`createdAt`);--> statement-breakpoint
CREATE INDEX `reward_redemptions_operational_idx` ON `reward_redemptions` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `rewards_catalog_idx` ON `rewards` (`status`,`category`,`points_cost`);--> statement-breakpoint
CREATE INDEX `risk_events_user_idx` ON `risk_events` (`user_id`,`severity`,`createdAt`);--> statement-breakpoint
CREATE INDEX `social_accounts_user_status_idx` ON `social_accounts` (`user_id`,`verification_status`);--> statement-breakpoint
CREATE INDEX `task_assignments_user_status_idx` ON `task_assignments` (`user_id`,`status`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `task_sessions_user_status_idx` ON `task_sessions` (`user_id`,`status`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `task_sessions_task_user_idx` ON `task_sessions` (`task_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `tasks_discovery_idx` ON `tasks` (`status`,`platform`,`priority`);--> statement-breakpoint
CREATE INDEX `tasks_campaign_idx` ON `tasks` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `tasks_window_idx` ON `tasks` (`startsAt`,`endsAt`);--> statement-breakpoint
CREATE INDEX `user_profiles_user_idx` ON `user_profiles` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_attempts_session_idx` ON `verification_attempts` (`session_id`,`status`);--> statement-breakpoint
CREATE INDEX `verification_signals_attempt_idx` ON `verification_signals` (`verification_attempt_id`);--> statement-breakpoint
CREATE INDEX `web_push_subscriptions_user_idx` ON `web_push_subscriptions` (`user_id`,`revokedAt`);