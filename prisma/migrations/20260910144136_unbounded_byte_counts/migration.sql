-- AlterTable
ALTER TABLE `languagestat` MODIFY `bytes` BIGINT NOT NULL;

-- AlterTable
ALTER TABLE `projectsnapshot` MODIFY `totalBytes` BIGINT NOT NULL;

-- AlterTable
ALTER TABLE `snapshotfile` MODIFY `bytes` BIGINT NOT NULL;
