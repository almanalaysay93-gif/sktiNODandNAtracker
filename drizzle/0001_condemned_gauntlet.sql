CREATE TABLE `activityLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supervisorId` int,
	`nurseId` int,
	`actionType` varchar(64) NOT NULL,
	`entityType` varchar(64),
	`entityId` int,
	`summary` text NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activityLog_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_activity_nurse` UNIQUE(`nurseId`)
);
--> statement-breakpoint
CREATE TABLE `appSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(64) NOT NULL,
	`value` text,
	CONSTRAINT `appSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `appSettings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `areaAssignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nurseId` int NOT NULL,
	`areaId` int NOT NULL,
	`startDate` date NOT NULL,
	`endDate` date,
	`assignmentType` varchar(64),
	`remarks` text,
	`isCurrent` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `areaAssignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_asgn_nurse` UNIQUE(`nurseId`),
	CONSTRAINT `idx_asgn_area` UNIQUE(`areaId`)
);
--> statement-breakpoint
CREATE TABLE `areaTrainingRequirements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`areaId` int NOT NULL,
	`trainingId` int NOT NULL,
	`required` boolean NOT NULL DEFAULT true,
	CONSTRAINT `areaTrainingRequirements_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_area_training_req` UNIQUE(`areaId`,`trainingId`)
);
--> statement-breakpoint
CREATE TABLE `areas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`sortOrder` int NOT NULL DEFAULT 99,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `areas_id` PRIMARY KEY(`id`),
	CONSTRAINT `areas_code_unique` UNIQUE(`code`),
	CONSTRAINT `areas_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `credentialTypes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`issuingOrganizationDefault` text,
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `credentialTypes_id` PRIMARY KEY(`id`),
	CONSTRAINT `credentialTypes_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `customCalendarEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`eventDate` date NOT NULL,
	`startTime` varchar(8),
	`endTime` varchar(8),
	`allDay` boolean NOT NULL DEFAULT true,
	`nurseId` int,
	`areaId` int,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customCalendarEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_cce_date` UNIQUE(`eventDate`)
);
--> statement-breakpoint
CREATE TABLE `licenseReminders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`credentialId` int NOT NULL,
	`thresholdDays` int NOT NULL,
	`renewalCycleKey` varchar(128) NOT NULL,
	`triggerDate` date NOT NULL,
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	`acknowledgedAt` timestamp,
	`status` enum('active','acknowledged','expired') NOT NULL DEFAULT 'active',
	CONSTRAINT `licenseReminders_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_reminder_cycle` UNIQUE(`credentialId`,`thresholdDays`,`renewalCycleKey`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(64) NOT NULL,
	`severity` varchar(32) NOT NULL,
	`title` varchar(256) NOT NULL,
	`message` text,
	`nurseId` int,
	`relatedEntityType` varchar(64),
	`relatedEntityId` int,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_notif_read` UNIQUE(`readAt`)
);
--> statement-breakpoint
CREATE TABLE `nurseCredentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nurseId` int NOT NULL,
	`credentialTypeId` int NOT NULL,
	`licenseNumber` varchar(64),
	`issuingOrganization` varchar(128),
	`issueDate` date,
	`expiryDate` date NOT NULL,
	`renewalStatus` enum('Not Started','Renewal In Progress','Submitted','Renewed') NOT NULL DEFAULT 'Not Started',
	`verificationStatus` enum('Unverified','Pending Verification','Verified') NOT NULL DEFAULT 'Unverified',
	`documentKey` text,
	`renewalCycleKey` varchar(128) NOT NULL,
	`remarks` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `nurseCredentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_cred_nurse` UNIQUE(`nurseId`),
	CONSTRAINT `idx_cred_expiry` UNIQUE(`expiryDate`)
);
--> statement-breakpoint
CREATE TABLE `nurseTrainings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nurseId` int NOT NULL,
	`trainingId` int NOT NULL,
	`provider` varchar(128),
	`status` enum('Scheduled','Completed','Expired','Cancelled') NOT NULL DEFAULT 'Scheduled',
	`scheduledDate` date,
	`completionDate` date,
	`expiryDate` date,
	`trainingHours` int,
	`cpdUnits` int,
	`certificateNumber` varchar(64),
	`certificateKey` text,
	`remarks` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `nurseTrainings_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_nt_nurse` UNIQUE(`nurseId`),
	CONSTRAINT `idx_nt_expiry` UNIQUE(`expiryDate`)
);
--> statement-breakpoint
CREATE TABLE `nurses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` varchar(64) NOT NULL,
	`firstName` varchar(128) NOT NULL,
	`middleName` varchar(128),
	`lastName` varchar(128) NOT NULL,
	`suffix` varchar(32),
	`position` varchar(128),
	`dateHired` date,
	`employmentStatus` enum('Active','On Leave','Temporary Assignment','Transferred','Resigned','Retired','Archived') NOT NULL DEFAULT 'Active',
	`currentAreaId` int,
	`profilePhotoKey` text,
	`archivedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `nurses_id` PRIMARY KEY(`id`),
	CONSTRAINT `nurses_employeeId_unique` UNIQUE(`employeeId`),
	CONSTRAINT `idx_nurses_employee` UNIQUE(`employeeId`),
	CONSTRAINT `idx_nurses_lastname` UNIQUE(`lastName`),
	CONSTRAINT `idx_nurses_area` UNIQUE(`currentAreaId`)
);
--> statement-breakpoint
CREATE TABLE `trainingCatalog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`category` varchar(64),
	`renewalRequired` boolean NOT NULL DEFAULT false,
	`defaultValidityMonths` int,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trainingCatalog_id` PRIMARY KEY(`id`),
	CONSTRAINT `trainingCatalog_name_unique` UNIQUE(`name`)
);
