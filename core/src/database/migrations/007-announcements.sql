-- 公告表：支持管理员动态发布系统公告
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `announcements` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `title` VARCHAR(255) NOT NULL DEFAULT '',
    `version` VARCHAR(50) DEFAULT '',
    `publish_date` VARCHAR(50) DEFAULT '',
    `summary` TEXT DEFAULT NULL,
    `content` TEXT NOT NULL,
    `enabled` TINYINT(1) DEFAULT 1,
    `source_type` VARCHAR(32) NOT NULL DEFAULT 'manual',
    `source_key` VARCHAR(64) DEFAULT NULL,
    `release_url` VARCHAR(1024) DEFAULT '',
    `assets_json` JSON DEFAULT NULL,
    `installed_version` VARCHAR(64) DEFAULT '',
    `installed_at` DATETIME DEFAULT NULL,
    `created_by` VARCHAR(100) DEFAULT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uniq_announcements_source_key` (`source_key`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
