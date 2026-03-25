ALTER TABLE `update_jobs`
    ADD COLUMN IF NOT EXISTS `preflight_json` JSON DEFAULT NULL AFTER `result_json`,
    ADD COLUMN IF NOT EXISTS `rollback_payload_json` JSON DEFAULT NULL AFTER `preflight_json`,
    ADD COLUMN IF NOT EXISTS `verification_json` JSON DEFAULT NULL AFTER `rollback_payload_json`,
    ADD COLUMN IF NOT EXISTS `result_signature` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' AFTER `verification_json`,
    ADD COLUMN IF NOT EXISTS `execution_phase` VARCHAR(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'queued' AFTER `result_signature`;

CREATE TABLE IF NOT EXISTS `update_job_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `job_id` BIGINT NOT NULL,
    `phase` VARCHAR(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'queued',
    `level` VARCHAR(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'info',
    `message` VARCHAR(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
    `payload_json` JSON DEFAULT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_update_job_logs_job_id_id` (`job_id`, `id`),
    KEY `idx_update_job_logs_phase_created` (`phase`, `created_at`),
    CONSTRAINT `fk_update_job_logs_job_id`
        FOREIGN KEY (`job_id`) REFERENCES `update_jobs` (`id`)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
