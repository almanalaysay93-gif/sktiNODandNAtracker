ALTER TABLE `nurses` ADD `contactNumber` varchar(32);--> statement-breakpoint
ALTER TABLE `nurses` ADD `accountEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `nurses` ADD `linkedUserId` int;--> statement-breakpoint
ALTER TABLE `nurses` ADD CONSTRAINT `idx_nurses_linked_user` UNIQUE(`linkedUserId`);