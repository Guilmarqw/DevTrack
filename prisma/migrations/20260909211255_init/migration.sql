-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `role` ENUM('ADMIN', 'USER') NOT NULL DEFAULT 'USER',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Project` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,
    `completionMode` ENUM('TASKS', 'MANUAL') NOT NULL DEFAULT 'TASKS',
    `manualCompletionPct` INTEGER NOT NULL DEFAULT 0,
    `trackFiles` BOOLEAN NOT NULL DEFAULT false,

    INDEX `Project_ownerId_idx`(`ownerId`),
    UNIQUE INDEX `Project_ownerId_name_key`(`ownerId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `source` ENUM('UPLOAD', 'RESCAN') NOT NULL,
    `uploadKind` ENUM('FOLDER', 'ZIP') NOT NULL,
    `sourceName` VARCHAR(191) NOT NULL,
    `totalFiles` INTEGER NOT NULL,
    `totalLines` INTEGER NOT NULL,
    `totalBytes` INTEGER NOT NULL,
    `completionPct` DOUBLE NOT NULL,

    INDEX `ProjectSnapshot_projectId_createdAt_idx`(`projectId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LanguageStat` (
    `id` VARCHAR(191) NOT NULL,
    `snapshotId` VARCHAR(191) NOT NULL,
    `language` VARCHAR(191) NOT NULL,
    `fileCount` INTEGER NOT NULL,
    `lines` INTEGER NOT NULL,
    `bytes` INTEGER NOT NULL,

    UNIQUE INDEX `LanguageStat_snapshotId_language_key`(`snapshotId`, `language`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SnapshotFile` (
    `id` VARCHAR(191) NOT NULL,
    `snapshotId` VARCHAR(191) NOT NULL,
    `path` TEXT NOT NULL,
    `pathHash` CHAR(64) NOT NULL,
    `language` VARCHAR(191) NULL,
    `lines` INTEGER NOT NULL,
    `bytes` INTEGER NOT NULL,

    INDEX `SnapshotFile_snapshotId_language_idx`(`snapshotId`, `language`),
    UNIQUE INDEX `SnapshotFile_snapshotId_pathHash_key`(`snapshotId`, `pathHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Dependency` (
    `id` VARCHAR(191) NOT NULL,
    `snapshotId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `version` VARCHAR(191) NULL,
    `manager` ENUM('NPM', 'PIP', 'GO', 'CARGO', 'COMPOSER', 'OTHER') NOT NULL,
    `scope` ENUM('RUNTIME', 'DEV', 'PEER', 'OPTIONAL') NOT NULL DEFAULT 'RUNTIME',
    `sourceFile` VARCHAR(191) NOT NULL,

    INDEX `Dependency_snapshotId_idx`(`snapshotId`),
    UNIQUE INDEX `Dependency_snapshotId_manager_name_scope_key`(`snapshotId`, `manager`, `name`, `scope`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Task` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `status` ENUM('TODO', 'IN_PROGRESS', 'DONE') NOT NULL DEFAULT 'TODO',
    `weight` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,

    INDEX `Task_projectId_status_idx`(`projectId`, `status`),
    INDEX `Task_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TechTag` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` ENUM('FRONTEND', 'BACKEND', 'DATABASE', 'OTHER') NOT NULL,
    `origin` ENUM('DETECTED', 'MANUAL') NOT NULL DEFAULT 'DETECTED',
    `evidence` TEXT NULL,
    `dismissedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TechTag_projectId_idx`(`projectId`),
    UNIQUE INDEX `TechTag_projectId_category_name_key`(`projectId`, `category`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivityLogEntry` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `type` ENUM('PROJECT_CREATED', 'PROJECT_UPDATED', 'SNAPSHOT_UPLOADED', 'SNAPSHOT_RESCANNED', 'TASK_CREATED', 'TASK_UPDATED', 'TASK_COMPLETED', 'TASK_DELETED', 'TECH_TAGS_UPDATED', 'COMPLETION_TARGET_CHANGED') NOT NULL,
    `summary` VARCHAR(191) NOT NULL,
    `metadata` JSON NULL,
    `snapshotId` VARCHAR(191) NULL,
    `actorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActivityLogEntry_projectId_createdAt_idx`(`projectId`, `createdAt`),
    INDEX `ActivityLogEntry_snapshotId_idx`(`snapshotId`),
    INDEX `ActivityLogEntry_actorId_idx`(`actorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectSnapshot` ADD CONSTRAINT `ProjectSnapshot_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LanguageStat` ADD CONSTRAINT `LanguageStat_snapshotId_fkey` FOREIGN KEY (`snapshotId`) REFERENCES `ProjectSnapshot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SnapshotFile` ADD CONSTRAINT `SnapshotFile_snapshotId_fkey` FOREIGN KEY (`snapshotId`) REFERENCES `ProjectSnapshot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Dependency` ADD CONSTRAINT `Dependency_snapshotId_fkey` FOREIGN KEY (`snapshotId`) REFERENCES `ProjectSnapshot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TechTag` ADD CONSTRAINT `TechTag_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityLogEntry` ADD CONSTRAINT `ActivityLogEntry_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityLogEntry` ADD CONSTRAINT `ActivityLogEntry_snapshotId_fkey` FOREIGN KEY (`snapshotId`) REFERENCES `ProjectSnapshot`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityLogEntry` ADD CONSTRAINT `ActivityLogEntry_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
