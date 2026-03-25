# 帮助中心可观测性 API 规格草案

## 目标

本稿用于约束帮助中心下一阶段新增接口的范围、权限、输入输出和失败语义。

要求：

- 所有新增接口统一挂在 `/api/help-center/*`
- 不修改现有 `/api/bug-report/*`、`/api/admin-operation-logs`、`/api/system-logs`
- 保持现有项目统一返回格式：`{ ok, data }` 或 `{ ok, error }`

## 总体接口分组

### 事件采集

- `POST /api/help-center/events/batch`

### 统计查询

- `GET /api/help-center/analytics/overview`
- `GET /api/help-center/analytics/articles`
- `GET /api/help-center/analytics/entry-pages`
- `GET /api/help-center/analytics/search-keywords`
- `GET /api/help-center/analytics/jump-failures`

### 文档反馈

- `POST /api/help-center/feedback`
- `GET /api/help-center/feedback`
- `GET /api/help-center/feedback/:id`
- `PATCH /api/help-center/feedback/:id`
- `POST /api/help-center/feedback/:id/assign`
- `POST /api/help-center/feedback/:id/link-bug-report`

### 配置

- `GET /api/help-center/config`
- `GET /api/settings/help-center-observability`
- `POST /api/settings/help-center-observability`

## 权限模型

### 公共用户能力

- 登录用户可调用：
  - `POST /api/help-center/events/batch`
  - `POST /api/help-center/feedback`
  - `GET /api/help-center/config`

### 管理员能力

- 管理员可调用：
  - 所有 analytics 接口
  - 所有 feedback 管理接口
  - 所有 observability 设置接口

### 普通用户受限能力

- 普通用户不应看到全局埋点统计
- 普通用户只能提交反馈，不能查询所有反馈
- 如果需要“查看自己提交的反馈”，建议未来加 `GET /api/help-center/my-feedback`

## 统一错误码建议

帮助中心新增接口统一用这些通用错误码：

- `help_center_feature_disabled`
- `help_center_invalid_payload`
- `help_center_forbidden`
- `help_center_not_found`
- `help_center_conflict`
- `help_center_rate_limited`
- `help_center_internal_error`

返回建议：

```json
{
  "ok": false,
  "error": "帮助中心反馈功能未开启",
  "code": "help_center_feature_disabled"
}
```

## 1. POST /api/help-center/events/batch

### 用途

批量接收前端帮助中心埋点事件。

### 权限

- 登录用户

### 请求体

```json
{
  "events": [
    {
      "eventNo": "HCE20260325-001",
      "eventType": "article_open",
      "sessionId": "hc-session-1",
      "traceId": "hc-trace-1",
      "articleId": "quick-start",
      "articleTitle": "快速上手",
      "articleCategory": "快速开始",
      "sectionId": "推荐启动路径",
      "sectionTitle": "推荐启动路径",
      "sourcePage": "settings",
      "sourceRoute": "/settings?category=advanced",
      "sourceContext": "context_help_button",
      "targetRoute": "/help?article=quick-start",
      "audienceFilter": "recommended",
      "quickFilter": "all",
      "result": "success",
      "errorCode": "",
      "latencyMs": 84,
      "meta": {
        "routeName": "settings",
        "fromContextHelp": true
      }
    }
  ]
}
```

### 响应

```json
{
  "ok": true,
  "data": {
    "accepted": 1,
    "ignored": 0
  }
}
```

### 服务端规则

- 单批建议最多 50 条
- 单事件 JSON 建议不超过 4KB
- 无效事件忽略但不影响整批成功
- 可按采样率和开关进一步拒绝写入

## 2. GET /api/help-center/config

### 用途

给前端返回帮助中心 observability 前端可见配置。

### 权限

- 登录用户

### 响应

```json
{
  "ok": true,
  "data": {
    "telemetryEnabled": false,
    "feedbackEnabled": false,
    "jumpTracingEnabled": false,
    "telemetrySamplingRate": 0
  }
}
```

### 说明

- 这个接口只返回前端需要知道的开关
- 不返回内部邮件配置、通知配置等敏感项

## 3. GET /api/help-center/analytics/overview

### 用途

帮助中心全局统计总览。

### 权限

- 管理员

### 查询参数

- `dateFrom`
- `dateTo`
- `role`

### 返回建议

```json
{
  "ok": true,
  "data": {
    "articleOpenCount": 1280,
    "searchCount": 314,
    "copyCount": 502,
    "contextHelpOpenCount": 226,
    "jumpSuccessRate": 98.4,
    "jumpFailureCount": 11,
    "feedbackOpenCount": 7
  }
}
```

## 4. GET /api/help-center/analytics/articles

### 用途

查看帮助文档热度排行。

### 权限

- 管理员

### 查询参数

- `dateFrom`
- `dateTo`
- `limit`
- `category`
- `sortBy`

### `sortBy` 建议值

- `opens`
- `copies`
- `feedbacks`
- `jump_failures`

### 返回建议

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "articleId": "quick-start",
        "articleTitle": "快速上手",
        "category": "快速开始",
        "openCount": 320,
        "copyCount": 88,
        "feedbackCount": 2,
        "jumpFailureCount": 0
      }
    ]
  }
}
```

## 5. GET /api/help-center/analytics/entry-pages

### 用途

查看上下文帮助入口来源页面排行。

### 权限

- 管理员

### 返回建议

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "sourcePage": "settings",
        "openCount": 124,
        "successRate": 99.2
      },
      {
        "sourcePage": "accounts",
        "openCount": 73,
        "successRate": 96.4
      }
    ]
  }
}
```

## 6. GET /api/help-center/analytics/search-keywords

### 用途

查看帮助中心搜索词排行。

### 权限

- 管理员

### 查询参数

- `dateFrom`
- `dateTo`
- `limit`

### 返回建议

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "keyword": "排空",
        "searchCount": 58,
        "resultClickCount": 41
      }
    ]
  }
}
```

### 注意

- 搜索词要做长度限制
- 可考虑做轻量脱敏
- 不保留完整长文本搜索原句

## 7. GET /api/help-center/analytics/jump-failures

### 用途

查看跳转失败链路热点。

### 权限

- 管理员

### 查询参数

- `dateFrom`
- `dateTo`
- `sourcePage`
- `articleId`
- `errorCode`

### 返回建议

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "sourcePage": "settings",
        "sourceContext": "context_help_button",
        "articleId": "system-update-center",
        "sectionId": "任务执行",
        "failureCount": 5,
        "topErrorCode": "anchor_missing"
      }
    ]
  }
}
```

## 8. POST /api/help-center/feedback

### 用途

提交帮助中心文档反馈。

### 权限

- 登录用户

### 请求体

```json
{
  "articleId": "quick-start",
  "articleTitle": "快速上手",
  "sectionId": "推荐启动路径",
  "sectionTitle": "推荐启动路径",
  "feedbackType": "outdated",
  "priority": "medium",
  "sourcePage": "help",
  "sourceRoute": "/help?article=quick-start",
  "sourceContext": "governance_panel",
  "audienceFilter": "recommended",
  "quickFilter": "all",
  "message": "当前描述还是旧版概览页，不符合新版入口结构。",
  "expectedBehavior": "应该按账号、设置、概览三段描述。",
  "actualBehavior": "正文仍然指向旧菜单逻辑。"
}
```

### 响应

```json
{
  "ok": true,
  "data": {
    "feedbackNo": "HCF20260325-0001",
    "status": "open"
  }
}
```

### 规则

- 反馈开关关闭时直接拒绝
- 需限流，建议同一用户 1 分钟内最多 3 次
- 内容长度和字段枚举必须校验

## 9. GET /api/help-center/feedback

### 用途

管理员查看帮助中心反馈列表。

### 权限

- 管理员

### 查询参数

- `status`
- `feedbackType`
- `priority`
- `articleId`
- `assignedTo`
- `keyword`
- `dateFrom`
- `dateTo`
- `page`
- `limit`

### 响应

```json
{
  "ok": true,
  "data": {
    "items": [],
    "page": 1,
    "limit": 20,
    "total": 0
  }
}
```

## 10. GET /api/help-center/feedback/:id

### 用途

查看单条反馈详情。

### 权限

- 管理员

### 返回建议

- 返回完整记录
- 可附带关联的 bug report 摘要
- 可附带最近操作日志摘要

## 11. PATCH /api/help-center/feedback/:id

### 用途

更新反馈状态、优先级、处理备注。

### 权限

- 管理员

### 请求体建议

```json
{
  "status": "in_progress",
  "priority": "high",
  "message": "已确认是旧版说明残留，准备补新版截图。"
}
```

### 处理要求

- 更新成功后写入 `admin_operation_logs`
- 记录操作者、动作、状态变更

## 12. POST /api/help-center/feedback/:id/assign

### 用途

给反馈分派负责人。

### 权限

- 管理员

### 请求体建议

```json
{
  "assignedTo": "admin",
  "ownerTeam": "产品与运营文档"
}
```

## 13. POST /api/help-center/feedback/:id/link-bug-report

### 用途

把文档反馈升级或关联到现有 bug report。

### 权限

- 管理员

### 请求体建议

```json
{
  "bugReportNo": "BR20260325-101500-ABCD"
}
```

### 规则

- 成功后更新 `linked_bug_report_no`
- 状态可自动改成 `merged_to_bug_report`
- 同步写 `admin_operation_logs`

## 14. GET /api/settings/help-center-observability

### 用途

管理员读取帮助中心 observability 配置。

### 权限

- 管理员

### 返回建议

```json
{
  "ok": true,
  "data": {
    "telemetryEnabled": false,
    "feedbackEnabled": false,
    "jumpTracingEnabled": false,
    "telemetrySamplingRate": 0,
    "batchSize": 20,
    "flushIntervalMs": 15000,
    "retentionDays": 90
  }
}
```

## 15. POST /api/settings/help-center-observability

### 用途

管理员保存帮助中心 observability 配置。

### 权限

- 管理员

### 存储方式

- 建议写入 `system_settings`
- key: `help_center_observability_config`

### 注意

- 默认全关
- 保存配置成功后不要求重启主服务

## 服务端实现建议

### 路由拆分

建议新增控制器文件：

- `core/src/controllers/admin/help-center-observability-routes.js`
- `core/src/controllers/admin/help-center-feedback-routes.js`
- `core/src/controllers/admin/help-center-analytics-routes.js`

### 服务拆分

建议新增服务文件：

- `core/src/services/help-center-event-service.js`
- `core/src/services/help-center-feedback-service.js`
- `core/src/services/help-center-analytics-service.js`

### 注册方式

在 [admin.js](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/core/src/controllers/admin.js#L1) 中按现有注册模式增量接入。

## 不影响现有功能的保证

- 所有路由都是新增路径
- 所有接口默认由系统设置开关保护
- 埋点与反馈入库失败只返回当前接口失败，不回卷现有帮助中心阅读和跳转主流程
