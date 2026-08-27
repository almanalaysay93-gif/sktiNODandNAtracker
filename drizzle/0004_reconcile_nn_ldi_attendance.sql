-- Roll back only records created by the erroneous automated workbook imports
-- deployed between 2026-08-27 09:06 UTC and this corrective migration.
DELETE lr
FROM `licenseReminders` lr
JOIN `nurseCredentials` nc ON nc.`id` = lr.`credentialId`
JOIN `nurses` n ON n.`id` = nc.`nurseId`
WHERE n.`createdAt` >= '2026-08-27 09:06:00'
  AND n.`linkedUserId` IS NULL;
--> statement-breakpoint
DELETE nt
FROM `nurseTrainings` nt
WHERE nt.`createdAt` >= '2026-08-27 09:06:00'
  AND nt.`eventId` IS NOT NULL
  AND nt.`remarks` LIKE 'Attended %';
--> statement-breakpoint
DELETE nc
FROM `nurseCredentials` nc
JOIN `nurses` n ON n.`id` = nc.`nurseId`
WHERE n.`createdAt` >= '2026-08-27 09:06:00'
  AND n.`linkedUserId` IS NULL;
--> statement-breakpoint
DELETE aa
FROM `areaAssignments` aa
JOIN `nurses` n ON n.`id` = aa.`nurseId`
WHERE n.`createdAt` >= '2026-08-27 09:06:00'
  AND n.`linkedUserId` IS NULL;
--> statement-breakpoint
DELETE n
FROM `nurses` n
WHERE n.`createdAt` >= '2026-08-27 09:06:00'
  AND n.`linkedUserId` IS NULL
  AND NOT EXISTS (SELECT 1 FROM `nurseTrainings` nt WHERE nt.`nurseId` = n.`id`);
--> statement-breakpoint
DELETE te
FROM `trainingEvents` te
WHERE te.`createdAt` >= '2026-08-27 09:06:00'
  AND te.`remarks` LIKE 'Conducted by %'
  AND NOT EXISTS (SELECT 1 FROM `nurseTrainings` nt WHERE nt.`eventId` = te.`id`);
--> statement-breakpoint
DELETE tc
FROM `trainingCatalog` tc
WHERE tc.`createdAt` >= '2026-08-27 09:06:00'
  AND NOT EXISTS (SELECT 1 FROM `trainingEvents` te WHERE te.`trainingId` = tc.`id`)
  AND NOT EXISTS (SELECT 1 FROM `nurseTrainings` nt WHERE nt.`trainingId` = tc.`id`)
  AND NOT EXISTS (SELECT 1 FROM `areaTrainingRequirements` atr WHERE atr.`trainingId` = tc.`id`);
--> statement-breakpoint

UPDATE `nurses`
SET `firstName` = 'Mary Grace', `middleName` = 'S.', `lastName` = 'Sotto'
WHERE `employeeId` = 'NA-039';
--> statement-breakpoint

-- Remove four legacy rows produced by parsing typed Excel dates as MM/DD/YY.
-- Repaired seed inserts correct rows immediately after migration.
DELETE nt
FROM `nurseTrainings` nt
JOIN `nurses` n ON n.`id` = nt.`nurseId`
JOIN `trainingCatalog` tc ON tc.`id` = nt.`trainingId`
WHERE nt.`eventId` IS NOT NULL
  AND nt.`remarks` LIKE 'Attended %'
  AND (
    (n.`employeeId` = 'NA-008' AND LOWER(tc.`name`) = LOWER('Water Treatment System Operations training') AND NOT (nt.`completionDate` <=> '2026-03-17'))
    OR (n.`employeeId` = 'NA-029' AND LOWER(tc.`name`) = LOWER('CDP IN HEMODIALYSIS') AND NOT (nt.`completionDate` <=> '2026-02-04'))
    OR (n.`employeeId` = 'RN-010' AND LOWER(tc.`name`) = LOWER('Empowering Nurses In Heart Disease Prevention And Patient Care') AND NOT (nt.`completionDate` <=> '2026-02-20'))
    OR (n.`employeeId` = 'RN-051' AND LOWER(tc.`name`) = LOWER('CDP in Hemodialysis') AND NOT (nt.`completionDate` <=> '2026-02-04'))
  );
--> statement-breakpoint

-- Remove three Ayla Ysulat rows assigned to Jose Ysulat by surname fallback.
DELETE nt
FROM `nurseTrainings` nt
JOIN `nurses` n ON n.`id` = nt.`nurseId` AND n.`employeeId` = 'RN-051'
JOIN `trainingCatalog` tc ON tc.`id` = nt.`trainingId`
WHERE nt.`eventId` IS NOT NULL
  AND nt.`remarks` LIKE 'Attended %'
  AND (
    (LOWER(tc.`name`) = LOWER('Potential Multiple Organ Donor (Pmod) Management And Training Course') AND nt.`completionDate` = '2026-04-21')
    OR (LOWER(tc.`name`) = LOWER('SUSTAINABLE ORGAN DONATION & TRANSPLANTATION SYSTEM IN THE PHILIPPINES: DEVELOPING THE 2025 NATIONAL STRATEGY') AND nt.`completionDate` = '2026-05-13')
    OR (LOWER(tc.`name`) = LOWER('LEARNING LOUNGE: BUILDING A POSITIVE PRACTICE ENVIRONMENT FOR NURSES: KEY TO QUALITY CARE') AND nt.`completionDate` = '2026-04-10')
  );
--> statement-breakpoint

INSERT INTO `activityLog` (`actionType`, `summary`, `metadata`)
VALUES (
  'system.data.repair',
  'Reconciled nurse and nursing attendant training data to NN LDI DATABASE SUMMARY.xlsx.',
  JSON_OBJECT('source', 'NN LDI DATABASE SUMMARY.xlsx', 'sourceStaff', 159, 'sourceAttendanceRows', 823, 'uniqueAttendanceLinks', 818)
);
