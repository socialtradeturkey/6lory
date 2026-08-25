ALTER TABLE `tasks` ADD `audience_mode` enum('open','assigned') DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `assignment_target_count` int;