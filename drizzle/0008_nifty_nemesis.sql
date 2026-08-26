ALTER TABLE `tasks` ADD `secret_code_display_seconds` int DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `secret_code_random_min_seconds` int DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `secret_code_random_max_seconds` int DEFAULT 60 NOT NULL;