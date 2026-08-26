CREATE TABLE `local_auth_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` varchar(128) NOT NULL,
	`failed_attempts` int NOT NULL DEFAULT 0,
	`locked_until` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `local_auth_credentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `local_auth_credentials_user_id_unique` UNIQUE(`user_id`),
	CONSTRAINT `local_auth_credentials_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `local_auth_credentials` ADD CONSTRAINT `local_auth_credentials_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `local_auth_email_idx` ON `local_auth_credentials` (`email`);