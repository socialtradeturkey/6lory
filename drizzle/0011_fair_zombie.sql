CREATE TABLE `youtube_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`youtube_channel_id` varchar(64),
	`access_token_ciphertext` text NOT NULL,
	`refresh_token_ciphertext` text,
	`expiresAt` timestamp,
	`scopes` json,
	`lastCheckedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `youtube_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `youtube_connections_user_id_unique` UNIQUE(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `youtube_channel_id` varchar(64);--> statement-breakpoint
ALTER TABLE `tasks` ADD `requires_youtube_subscription` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `requires_youtube_like` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `youtube_connections` ADD CONSTRAINT `youtube_connections_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `youtube_connections_user_idx` ON `youtube_connections` (`user_id`);