-- CreateTable
CREATE TABLE `SnapshotFinding` (
    `id` VARCHAR(191) NOT NULL,
    `snapshotId` VARCHAR(191) NOT NULL,
    `rule` VARCHAR(191) NOT NULL,
    `severity` ENUM('ERROR', 'WARN', 'INFO') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `detail` TEXT NOT NULL,
    `path` TEXT NULL,

    INDEX `SnapshotFinding_snapshotId_severity_idx`(`snapshotId`, `severity`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SnapshotFinding` ADD CONSTRAINT `SnapshotFinding_snapshotId_fkey` FOREIGN KEY (`snapshotId`) REFERENCES `ProjectSnapshot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
