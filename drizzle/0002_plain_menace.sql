CREATE TABLE `trainingEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trainingId` int NOT NULL,
	`provider` varchar(128),
	`venue` varchar(256),
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	`startTime` varchar(8),
	`endTime` varchar(8),
	`targetStaffType` enum('All','Registered Nurse','Nursing Attendant') NOT NULL DEFAULT 'All',
	`remarks` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trainingEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `areaAssignments` DROP INDEX `idx_asgn_nurse`;--> statement-breakpoint
ALTER TABLE `areaAssignments` DROP INDEX `idx_asgn_area`;--> statement-breakpoint
ALTER TABLE `nurseCredentials` DROP INDEX `idx_cred_nurse`;--> statement-breakpoint
ALTER TABLE `nurseCredentials` DROP INDEX `idx_cred_expiry`;--> statement-breakpoint
ALTER TABLE `nurseTrainings` DROP INDEX `idx_nt_nurse`;--> statement-breakpoint
ALTER TABLE `nurseTrainings` DROP INDEX `idx_nt_expiry`;--> statement-breakpoint
ALTER TABLE `activityLog` DROP INDEX `idx_activity_nurse`;--> statement-breakpoint
ALTER TABLE `nurses` DROP INDEX `idx_nurses_lastname`;--> statement-breakpoint
ALTER TABLE `nurses` DROP INDEX `idx_nurses_area`;--> statement-breakpoint
ALTER TABLE `nurses` MODIFY COLUMN `employmentStatus` enum('Active','On Leave','Temporary Assignment','Transferred','Rotated','Resigned','Retired','Archived') NOT NULL DEFAULT 'Active';--> statement-breakpoint
ALTER TABLE `notifications` ADD `dayKey` date;--> statement-breakpoint
ALTER TABLE `nurseTrainings` ADD `eventId` int;--> statement-breakpoint
ALTER TABLE `nurseTrainings` ADD `participationRole` enum('Participant','Speaker','Facilitator','Preceptor') DEFAULT 'Participant' NOT NULL;--> statement-breakpoint
ALTER TABLE `nurses` ADD `staffType` enum('Registered Nurse','Nursing Attendant') DEFAULT 'Registered Nurse' NOT NULL;--> statement-breakpoint
ALTER TABLE `trainingCatalog` ADD `kind` enum('Training','Seminar','LDI') DEFAULT 'Training' NOT NULL;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `uniq_notif_day` UNIQUE(`type`,`nurseId`,`relatedEntityType`,`relatedEntityId`,`dayKey`);--> statement-breakpoint
CREATE INDEX `idx_training_event_date` ON `trainingEvents` (`trainingId`,`startDate`);--> statement-breakpoint
CREATE INDEX `idx_asgn_nurse` ON `areaAssignments` (`nurseId`);--> statement-breakpoint
CREATE INDEX `idx_asgn_area` ON `areaAssignments` (`areaId`);--> statement-breakpoint
CREATE INDEX `idx_cred_nurse` ON `nurseCredentials` (`nurseId`);--> statement-breakpoint
CREATE INDEX `idx_cred_expiry` ON `nurseCredentials` (`expiryDate`);--> statement-breakpoint
CREATE INDEX `idx_nt_nurse` ON `nurseTrainings` (`nurseId`);--> statement-breakpoint
CREATE INDEX `idx_nt_training` ON `nurseTrainings` (`trainingId`);--> statement-breakpoint
CREATE INDEX `idx_nt_event` ON `nurseTrainings` (`eventId`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_nt_event_nurse` ON `nurseTrainings` (`eventId`,`nurseId`);--> statement-breakpoint
CREATE INDEX `idx_nt_expiry` ON `nurseTrainings` (`expiryDate`);--> statement-breakpoint
CREATE INDEX `idx_activity_nurse` ON `activityLog` (`nurseId`);--> statement-breakpoint
CREATE INDEX `idx_nurses_lastname` ON `nurses` (`lastName`);--> statement-breakpoint
CREATE INDEX `idx_nurses_area` ON `nurses` (`currentAreaId`);--> statement-breakpoint
ALTER TABLE `customCalendarEvents` DROP INDEX `idx_cce_date`;--> statement-breakpoint
ALTER TABLE `notifications` DROP INDEX `idx_notif_read`;--> statement-breakpoint
CREATE INDEX `idx_cce_date` ON `customCalendarEvents` (`eventDate`);--> statement-breakpoint
CREATE INDEX `idx_notif_read` ON `notifications` (`readAt`);
