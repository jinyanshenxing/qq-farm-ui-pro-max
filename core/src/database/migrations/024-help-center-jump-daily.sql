CREATE TABLE IF NOT EXISTS `help_center_jump_daily` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `record_date` DATE NOT NULL,
    `source_page` VARCHAR(80) NOT NULL DEFAULT '',
    `source_context` VARCHAR(120) NOT NULL DEFAULT '',
    `article_id` VARCHAR(80) NOT NULL DEFAULT '',
    `section_id` VARCHAR(120) NOT NULL DEFAULT '',
    `user_role` VARCHAR(32) NOT NULL DEFAULT '',
    `success_count` INT NOT NULL DEFAULT 0,
    `failed_count` INT NOT NULL DEFAULT 0,
    `fallback_count` INT NOT NULL DEFAULT 0,
    `avg_latency_ms` INT NOT NULL DEFAULT 0,
    `top_error_code` VARCHAR(64) NOT NULL DEFAULT '',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_help_center_jump_daily_dims` (`record_date`, `source_page`, `source_context`, `article_id`, `section_id`, `user_role`),
    KEY `idx_help_center_jump_daily_date_source` (`record_date`, `source_page`),
    KEY `idx_help_center_jump_daily_article` (`article_id`, `record_date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '帮助中心跳转链路日聚合表';
