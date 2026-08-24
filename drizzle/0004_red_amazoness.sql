CREATE TABLE `role_definitions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` enum('user','admin','moderator','verification_reviewer','reward_manager') NOT NULL,
	`label` varchar(96) NOT NULL,
	`description` text,
	`is_system` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `role_definitions_id` PRIMARY KEY(`id`),
	CONSTRAINT `role_definitions_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`role_code` enum('user','admin','moderator','verification_reviewer','reward_manager') NOT NULL,
	`permission` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `role_permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `role_permission_unique` UNIQUE(`role_code`,`permission`)
);
