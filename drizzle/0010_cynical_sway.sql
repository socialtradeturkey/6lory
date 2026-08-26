ALTER TABLE `user_profiles` ADD `phone_number` varchar(32);--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `province` varchar(64);--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `age` int;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `gender` enum('female','male','non_binary','prefer_not_to_say');