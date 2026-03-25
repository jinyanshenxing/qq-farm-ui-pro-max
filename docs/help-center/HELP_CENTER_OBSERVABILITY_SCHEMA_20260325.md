# 帮助中心可观测性数据表与迁移设计稿

## 目标

本稿用于细化帮助中心下一阶段的数据层设计，覆盖：

- 后台埋点统计
- 文档反馈闭环
- 跳转失败链路追踪

约束：

- 仅新增表，不改现有表结构
- 仅新增索引，不影响现有查询
- 迁移编号从仓库当前最新 `020` 往后排

## 迁移清单

建议新增以下迁移：

1. `021-help-center-events.sql`
2. `022-help-center-feedback.sql`
3. `023-help-center-event-daily.sql`
4. `024-help-center-jump-daily.sql`

其中 `024` 为可选迁移，只有在第三阶段确认需要独立的跳转聚合表时才创建。

## 设计原则

### 原始表与聚合表分层

- 原始事件表负责留痕和回溯
- 聚合表负责管理端统计查询
- 不允许管理端高频页面直接扫原始事件表做大范围统计

### 轻字段优先

埋点表字段尽量保持轻量：

- 文档 ID、事件类型、来源页面、结果、耗时、角色
- 少量 JSON 扩展字段

不保存：

- 完整 Markdown 正文
- 用户复制内容
- 整段系统日志原文
- 敏感 token / cookie / secret

### 兼容现有体系

现有可复用基础：

- 系统设置：`core/src/services/system-settings.js`
- 操作审计：`core/src/services/admin-operation-logs.js`
- 问题反馈：`core/src/services/bug-report-service.js`

所以帮助中心数据层应与这些服务并行，不应相互替换。

## 021-help-center-events.sql

### 表名

- `help_center_events`

### 用途

记录帮助中心原始行为事件，作为统计、排查和跳转链路分析的基础表。

### 建议字段

```sql
CREATE TABLE IF NOT EXISTS `help_center_events` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `event_no` VARCHAR(40) NOT NULL,
  `event_type` VARCHAR(64) NOT NULL,
  `session_id` VARCHAR(64) NOT NULL DEFAULT '',
  `trace_id` VARCHAR(64) NOT NULL DEFAULT '',
  `user_id` BIGINT DEFAULT NULL,
  `username` VARCHAR(64) NOT NULL DEFAULT '',
  `user_role` VARCHAR(32) NOT NULL DEFAULT '',
  `article_id` VARCHAR(80) NOT NULL DEFAULT '',
  `article_title` VARCHAR(160) NOT NULL DEFAULT '',
  `article_category` VARCHAR(80) NOT NULL DEFAULT '',
  `section_id` VARCHAR(120) NOT NULL DEFAULT '',
  `section_title` VARCHAR(160) NOT NULL DEFAULT '',
  `source_page` VARCHAR(80) NOT NULL DEFAULT '',
  `source_route` VARCHAR(255) NOT NULL DEFAULT '',
  `source_context` VARCHAR(120) NOT NULL DEFAULT '',
  `target_route` VARCHAR(255) NOT NULL DEFAULT '',
  `audience_filter` VARCHAR(32) NOT NULL DEFAULT '',
  `quick_filter` VARCHAR(32) NOT NULL DEFAULT '',
  `result` VARCHAR(24) NOT NULL DEFAULT 'success',
  `error_code` VARCHAR(64) NOT NULL DEFAULT '',
  `latency_ms` INT NOT NULL DEFAULT 0,
  `meta_json` JSON DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_help_center_events_event_no` (`event_no`),
  KEY `idx_help_center_events_created_at` (`created_at`),
  KEY `idx_help_center_events_type_created` (`event_type`, `created_at`),
  KEY `idx_help_center_events_article_created` (`article_id`, `created_at`),
  KEY `idx_help_center_events_trace_created` (`trace_id`, `created_at`),
  KEY `idx_help_center_events_source_created` (`source_page`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='帮助中心原始埋点事件表';
```

### 字段说明

- `event_no`
  用于幂等写入，避免前端重试造成重复。
- `session_id`
  同一浏览会话标识。
- `trace_id`
  用于把一次跳转链路内的多个事件串起来。
- `source_context`
  记录来源组件，如 `settings_context_help`、`outline_panel`、`must_read_card`。
- `meta_json`
  只放轻扩展字段，例如 `search_keyword`、`copy_kind`、`route_name`。

### 推荐枚举

- `result`: `success / failed / fallback / cancelled`
- `user_role`: `admin / user / guest`

## 022-help-center-feedback.sql

### 表名

- `help_center_feedback`

### 用途

承接帮助中心自己的文档治理反馈，不直接混入现有 `bug_reports`。

### 建议字段

```sql
CREATE TABLE IF NOT EXISTS `help_center_feedback` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `feedback_no` VARCHAR(40) NOT NULL,
  `article_id` VARCHAR(80) NOT NULL DEFAULT '',
  `article_title` VARCHAR(160) NOT NULL DEFAULT '',
  `section_id` VARCHAR(120) NOT NULL DEFAULT '',
  `section_title` VARCHAR(160) NOT NULL DEFAULT '',
  `feedback_type` VARCHAR(32) NOT NULL DEFAULT 'other',
  `priority` VARCHAR(16) NOT NULL DEFAULT 'medium',
  `status` VARCHAR(24) NOT NULL DEFAULT 'open',
  `username` VARCHAR(64) NOT NULL DEFAULT '',
  `user_role` VARCHAR(32) NOT NULL DEFAULT '',
  `source_page` VARCHAR(80) NOT NULL DEFAULT '',
  `source_route` VARCHAR(255) NOT NULL DEFAULT '',
  `source_context` VARCHAR(120) NOT NULL DEFAULT '',
  `audience_filter` VARCHAR(32) NOT NULL DEFAULT '',
  `quick_filter` VARCHAR(32) NOT NULL DEFAULT '',
  `message` TEXT NOT NULL,
  `expected_behavior` TEXT NULL,
  `actual_behavior` TEXT NULL,
  `attachment_meta` JSON DEFAULT NULL,
  `assigned_to` VARCHAR(64) NOT NULL DEFAULT '',
  `owner_team` VARCHAR(64) NOT NULL DEFAULT '',
  `linked_bug_report_no` VARCHAR(40) NOT NULL DEFAULT '',
  `last_follow_up_at` TIMESTAMP NULL DEFAULT NULL,
  `resolved_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_help_center_feedback_no` (`feedback_no`),
  KEY `idx_help_center_feedback_status_created` (`status`, `created_at`),
  KEY `idx_help_center_feedback_article_created` (`article_id`, `created_at`),
  KEY `idx_help_center_feedback_assigned_status` (`assigned_to`, `status`),
  KEY `idx_help_center_feedback_type_created` (`feedback_type`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='帮助中心文档治理反馈表';
```

### 推荐枚举

- `feedback_type`
  `outdated / missing_step / unclear / wrong_route / copy_issue / jump_failed / other`
- `priority`
  `low / medium / high / critical`
- `status`
  `open / triaged / in_progress / resolved / rejected / merged_to_bug_report`

### 与 `bug_reports` 的关系

- 不做强外键
- 通过 `linked_bug_report_no` 建立松耦合关联
- 升级为 bug report 时由服务层同步写入操作审计日志

## 023-help-center-event-daily.sql

### 表名

- `help_center_event_daily`

### 用途

按天聚合帮助中心事件，为管理端看板和趋势查询服务。

### 建议字段

```sql
CREATE TABLE IF NOT EXISTS `help_center_event_daily` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `record_date` DATE NOT NULL,
  `event_type` VARCHAR(64) NOT NULL,
  `article_id` VARCHAR(80) NOT NULL DEFAULT '',
  `article_category` VARCHAR(80) NOT NULL DEFAULT '',
  `source_page` VARCHAR(80) NOT NULL DEFAULT '',
  `user_role` VARCHAR(32) NOT NULL DEFAULT '',
  `result` VARCHAR(24) NOT NULL DEFAULT 'success',
  `event_count` INT NOT NULL DEFAULT 0,
  `user_count` INT NOT NULL DEFAULT 0,
  `success_count` INT NOT NULL DEFAULT 0,
  `failed_count` INT NOT NULL DEFAULT 0,
  `avg_latency_ms` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_help_center_event_daily_dims`
    (`record_date`, `event_type`, `article_id`, `source_page`, `user_role`, `result`),
  KEY `idx_help_center_event_daily_date_type` (`record_date`, `event_type`),
  KEY `idx_help_center_event_daily_article` (`article_id`, `record_date`),
  KEY `idx_help_center_event_daily_source` (`source_page`, `record_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='帮助中心日聚合事件统计表';
```

### 生成方式

建议采用两种之一：

1. 定时任务离线聚合
2. 写原始表后异步增量汇总

推荐先用离线聚合，原因是：

- 风险更低
- 不影响主流程写入
- 更适合先灰度

## 024-help-center-jump-daily.sql

### 表名

- `help_center_jump_daily`

### 用途

第三阶段专用，用于快速分析帮助跳转链路成功率和失败热点。

如果前两阶段先只看 `help_center_event_daily` 就够，这张表可以晚点再建。

### 建议字段

```sql
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
  UNIQUE KEY `uk_help_center_jump_daily_dims`
    (`record_date`, `source_page`, `source_context`, `article_id`, `section_id`, `user_role`),
  KEY `idx_help_center_jump_daily_date_source` (`record_date`, `source_page`),
  KEY `idx_help_center_jump_daily_article` (`article_id`, `record_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='帮助中心跳转链路日聚合表';
```

## 系统设置键建议

不新开单独配置文件，沿用 `system_settings`。

建议新增这些 key：

- `help_center_observability_config`

内部结构建议：

```json
{
  "telemetryEnabled": false,
  "feedbackEnabled": false,
  "jumpTracingEnabled": false,
  "telemetrySamplingRate": 0,
  "batchSize": 20,
  "flushIntervalMs": 15000,
  "retentionDays": 90
}
```

## 数据保留策略

### 原始事件表

- 建议保留 30 到 90 天
- 超期定时清理

### 聚合表

- 建议至少保留 180 天

### 反馈表

- 不自动清理
- 通过状态和归档字段管理

## 迁移实施顺序

1. 先建 `021-help-center-events.sql`
2. 再建 `023-help-center-event-daily.sql`
3. 第二阶段建 `022-help-center-feedback.sql`
4. 第三阶段确认专项需求后再建 `024-help-center-jump-daily.sql`

## 不影响现有功能的原因

- 全是新增表，没有改既有表
- 没有改现有 `bug_reports`、`admin_operation_logs`、`user_preferences` 结构
- 不影响现有索引和历史查询
- 即使新功能关闭，数据库迁移也不会改变现有页面行为
