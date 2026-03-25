# 帮助中心后台埋点、文档反馈闭环与跳转失败链路采集方案

## 目标

本方案用于规划帮助中心下一阶段的三类能力：

1. 后台埋点统计
2. 文档反馈闭环
3. 真实跳转失败链路采集

本次规划有一个硬约束：

- 所有新增能力必须以“增量接入、默认不影响现有主流程”为前提
- 不改变现有帮助中心阅读、复制、搜索、跳转、设置页上下文帮助等已上线能力
- 不改写现有业务接口语义，只新增隔离的数据表、服务、路由和前端埋点包装层

## 现状基线

当前项目已经具备一批可以复用的基础设施，不需要从零搭建：

### 后端注册体系

- `core/src/controllers/admin.js`

现有管理面板基于 Express 统一注册路由，适合继续按模块注册新的帮助中心能力。

### 后台操作审计

- `core/src/services/admin-operation-logs.js`
- `core/src/controllers/admin/admin-operation-log-routes.js`

项目已经有成熟的“后台操作日志”服务，可复用其建表、查询、过滤、清空、管理端接入方式，用于记录帮助中心治理动作和后台状态变更。

### 问题反馈基础设施

- `core/src/controllers/admin/bug-report-routes.js`
- `core/src/services/bug-report-service.js`
- `core/src/services/bug-report-repository.js`
- `core/src/database/migrations/018-bug-reports.sql`

项目已经具备完整的问题反馈链路，包括：

- 前端提交入口
- 后端校验与落库
- 自动摘取 system logs / runtime logs / account logs
- 邮件 / 推送能力

这意味着“文档反馈闭环”不需要重新发明一套反馈机制，而应在现有 bug report 体系之上做面向文档治理的专用层。

### 日志与偏好存储

- `core/src/controllers/admin/system-public-routes.js`
- `core/src/services/user-preferences.js`
- `core/src/controllers/admin/settings-report-routes.js`

项目已有：

- 系统日志查询接口
- 用户偏好存储能力
- analytics view state 等 JSON 偏好列

这适合继续承接“帮助中心视图状态、埋点看板偏好、治理工作台筛选状态”。

## 总体原则

### 1. 只做增量，不做替换

- 新增 `help_center_*` 相关表
- 新增 `/api/help-center/*` 路由组
- 新增 `help-center-observability` 独立服务模块
- 不改动现有 `/api/bug-report/*`、`/api/admin-operation-logs`、`/api/system-logs` 的既有返回结构

### 2. 默认关闭，按开关启用

建议新增系统级开关：

- `helpCenterTelemetryEnabled`
- `helpCenterFeedbackEnabled`
- `helpCenterJumpTracingEnabled`
- `helpCenterTelemetrySamplingRate`

默认值：

- 统计关闭
- 反馈闭环关闭
- 跳转链路采集关闭
- 采样率 `0`

只有管理员在配置中开启后才生效。

### 3. 埋点失败不能影响主功能

前端埋点必须满足：

- 最多异步发送
- 失败静默吞掉
- 不阻塞路由跳转
- 不阻塞复制
- 不阻塞搜索
- 不阻塞页面渲染

后端写入必须满足：

- 任何埋点写库失败都只记内部日志
- 不向主业务页面抛 500 干扰用户操作

### 4. 数据严格脱敏

不得采集以下高风险内容：

- 完整 Markdown 正文
- 用户复制到剪贴板的原文
- 敏感 token / cookie / header
- 全量系统日志正文
- 用户输入的密码、卡密、SMTP 密码、第三方 key

可以采集的是：

- 文档 ID
- 分类
- 来源页面
- 操作类型
- 跳转结果
- 错误分类
- 耗时
- 聚合后的次数

## 模块一：后台埋点统计

### 业务目标

回答这几个问题：

1. 哪些帮助文档最常被打开
2. 哪些页面最常触发“上下文帮助”
3. 搜索最常搜什么
4. 哪些复制动作最常用
5. 哪些文章经常被读但仍然引发反馈
6. 哪些帮助入口点击后没有完成最终落地

### 采集范围

建议采集以下事件：

- `article_open`
- `article_switch`
- `search_submit`
- `search_result_click`
- `copy_plain_text`
- `copy_markdown`
- `copy_code_block`
- `copy_command_block`
- `audience_filter_change`
- `quick_filter_change`
- `outline_jump`
- `related_route_click`
- `context_help_open`
- `release_highlights_open`
- `governance_template_copy`
- `frequent_shortcut_click`

### 事件模型

建议新增原始事件表：

- `help_center_events`

建议字段：

- `id`
- `event_no`
- `event_type`
- `session_id`
- `trace_id`
- `user_id`
- `username`
- `user_role`
- `article_id`
- `article_title`
- `article_category`
- `source_page`
- `source_route`
- `source_context`
- `target_route`
- `audience_filter`
- `quick_filter`
- `result`
- `error_code`
- `latency_ms`
- `meta_json`
- `created_at`

其中：

- `session_id` 用于串联同一轮浏览
- `trace_id` 用于串联一次具体跳转或一次具体点击链路
- `result` 统一使用 `success / failed / fallback / cancelled`
- `meta_json` 只放轻量扩展字段

### 聚合层

原始表只负责留痕，不直接给管理端做重查询。

建议新增日聚合表：

- `help_center_event_daily`

按以下维度聚合：

- 日期
- 事件类型
- 文档 ID
- 分类
- 来源页面
- 用户角色
- 结果

典型指标：

- `pv_count`
- `uv_count`
- `success_count`
- `failed_count`
- `avg_latency_ms`

### 前端发送策略

新增独立埋点客户端：

- `web/src/services/help-center-telemetry.ts`

原则：

- 内存队列
- 批量发送
- `pagehide` 时用 `sendBeacon` 或 `fetch keepalive`
- 采样命中才发送
- 开关关闭时自动 no-op

### 后端接口

建议新增：

- `POST /api/help-center/events/batch`
- `GET /api/help-center/analytics/overview`
- `GET /api/help-center/analytics/articles`
- `GET /api/help-center/analytics/entry-pages`
- `GET /api/help-center/analytics/search-keywords`

其中：

- `POST` 只接收轻量批量事件
- `GET` 只给管理员开放
- 查询尽量走日聚合表

### 管理端展示

不建议一开始就在主帮助中心页面堆看板。

推荐落在已有后台体系中，作为新管理页或 analytics 子模块：

- 帮助中心总访问趋势
- 文档 TOP 排行
- 搜索词 TOP 排行
- 页面上下文帮助入口 TOP
- 复制动作 TOP
- 失败事件概览

## 模块二：文档反馈闭环

### 业务目标

让帮助中心不再只是“复制模板”，而是形成真正可追踪的治理闭环：

1. 用户能提交文档问题
2. 管理员能接收、分派、跟进、关闭
3. 每条反馈能回溯到具体文章、段落和页面上下文
4. 严重问题可联动现有 bug report 能力和消息通知

### 建议架构

不要直接把文档反馈硬塞进 `bug_reports`。

推荐做法：

- 新增专用表 `help_center_feedback`
- 保留与 `bug_reports` 的桥接能力

这样做的好处：

- 文档治理语义更清晰
- 状态流更适合文档维护
- 不会污染现有 bug report 统计

### 反馈类型

建议固定为：

- `outdated`
- `missing_step`
- `unclear`
- `wrong_route`
- `copy_issue`
- `jump_failed`
- `other`

### 状态流

建议统一状态机：

- `open`
- `triaged`
- `in_progress`
- `resolved`
- `rejected`
- `merged_to_bug_report`

### 数据字段

建议表字段：

- `id`
- `feedback_no`
- `article_id`
- `article_title`
- `section_id`
- `section_title`
- `feedback_type`
- `priority`
- `status`
- `username`
- `user_role`
- `source_route`
- `source_page`
- `source_context`
- `current_audience_filter`
- `current_quick_filter`
- `message`
- `expected_behavior`
- `actual_behavior`
- `attachment_meta`
- `assigned_to`
- `owner_team`
- `last_follow_up_at`
- `resolved_at`
- `linked_bug_report_no`
- `created_at`
- `updated_at`

### 前端入口

建议在现有“文档治理”面板上新增真正的提交能力，但保持 copy 模板仍然可用：

第一阶段入口：

- `复制过期反馈`
- `复制补充建议`
- `复制治理任务`
- `提交反馈`

第二阶段入口：

- `提交反馈` 支持预填文章、段落、当前视角、当前页面来源

### 后端接口

建议新增：

- `POST /api/help-center/feedback`
- `GET /api/help-center/feedback`
- `GET /api/help-center/feedback/:id`
- `PATCH /api/help-center/feedback/:id`
- `POST /api/help-center/feedback/:id/assign`
- `POST /api/help-center/feedback/:id/link-bug-report`

权限建议：

- 普通用户可提交、查看自己的反馈摘要
- 管理员可查看全部、筛选、分派、关闭、桥接 bug report

### 与 bug report 的桥接

建议只在以下场景桥接到 `bug_reports`：

- 用户反馈类型是 `jump_failed`
- 或反馈中明确属于产品 Bug
- 或同一文档在短时间内重复收到相同问题
- 或管理员手动点击“升级为 bug report”

桥接后：

- 在 `help_center_feedback.linked_bug_report_no` 留痕
- 在 `admin_operation_logs` 写入一次治理升级动作

### 通知与提醒

复用现有推送 / 邮件能力：

- 关键级别反馈可推送到管理员通道
- 每日或每周汇总未处理的文档反馈

## 模块三：真实跳转失败链路采集

### 业务目标

不仅知道用户点了“帮助”，还要知道：

1. 是从哪个页面点的
2. 想跳到哪篇文档 / 哪个段落
3. 最终有没有成功落地
4. 如果失败，失败在什么环节

### 需要覆盖的跳转链路

- 页面上下文帮助按钮 -> 帮助中心文章
- 帮助中心相关文章 -> 业务页面
- 帮助中心目录点击 -> 对应段落
- 帮助中心 query 参数恢复 -> 指定文章 / 指定段落
- 设置页锚点 -> 帮助中心锚点互跳

### 链路模型

每一次跳转生成一个 `trace_id`，并采集 4 类事件：

- `jump_intent`
- `jump_navigation_started`
- `jump_target_ready`
- `jump_completed`

如果失败，则补充：

- `jump_failed`
- `jump_fallback_used`

### 失败分类

建议标准化错误码：

- `article_not_found`
- `section_not_found`
- `route_not_found`
- `anchor_missing`
- `permission_denied`
- `page_not_ready_timeout`
- `context_mismatch`
- `router_cancelled`
- `unknown`

### 前端实现方式

新增独立链路追踪包装层：

- `web/src/services/help-center-jump-tracer.ts`

能力范围：

- 生成 `trace_id`
- 包装 `syncSelectedArticle`
- 包装 `jumpToOutline`
- 包装上下文帮助按钮的跳转逻辑
- 在目标页面 ready 后确认成功
- 超时自动记失败
- 使用 fallback 时补一条 `jump_fallback_used`

### 后端存储

不建议单独做第三张原始表，优先复用 `help_center_events`。

只有在需要高频专项分析时，再补聚合表：

- `help_center_jump_daily`

聚合维度：

- 来源页面
- 目标文章
- 目标段落
- 失败码
- 用户角色

### 管理端看板

建议输出 4 组内容：

1. 跳转成功率总览
2. 失败页面 TOP
3. 失败文章 / 段落 TOP
4. fallback 使用次数和命中率

## 推荐落地顺序

### Phase 1：埋点基础层

目标：

- 先把事件采集通路打通
- 只采帮助中心阅读、搜索、复制、上下文入口
- 不做复杂 UI

交付：

- `help_center_events`
- `POST /api/help-center/events/batch`
- 前端 telemetry 客户端
- 管理员基础 overview 接口

### Phase 2：文档反馈闭环

目标：

- 从“复制模板”升级到“可提交、可分派、可关闭”

交付：

- `help_center_feedback`
- 提交反馈接口
- 管理员反馈列表 / 状态流
- 与 `admin_operation_logs` 打通
- 必要时桥接 `bug_reports`

### Phase 3：跳转失败链路追踪

目标：

- 找出真正失败的帮助跳转链路，而不是只看点击量

交付：

- 跳转 trace 模型
- 失败错误码体系
- 成功 / 失败 / fallback 看板

### Phase 4：治理与统计工作台

目标：

- 把统计、反馈、失败链路放到同一个管理视角里

交付：

- 文档健康度概览
- 高频问题文档排行
- 反馈处理 SLA
- 跳转失败热点

## 数据库与迁移建议

建议新增迁移：

- `021-help-center-events.sql`
- `022-help-center-feedback.sql`
- `023-help-center-event-daily.sql`
- `024-help-center-jump-daily.sql`（可选，若第三阶段确认需要专项聚合再加）

要求：

- 全部采用新增表
- 不改既有表结构
- 索引优先按 `created_at`、`article_id`、`event_type`、`status` 设计

## 无侵入接入策略

### 前端

- 所有新能力都包在 `help-center` 专属服务里
- 开关关闭时直接 no-op
- 页面跳转逻辑原样保留，只在外围包一层 trace
- 反馈入口默认隐藏，开关开后才显示

### 后端

- 新路由统一放到 `/api/help-center/*`
- 注册顺序靠后，避免覆盖已有接口
- 入库失败只记 server log，不影响主响应

### 运维

- 默认不开启
- 先灰度到管理员账号
- 再灰度到少量普通用户
- 再全量

## 风险与规避

### 风险 1：埋点过多导致写库压力上升

规避：

- 采样率
- 批量上报
- 聚合表查询
- 后台分页查询

### 风险 2：埋点带来页面卡顿

规避：

- 前端只入队，不同步等待
- `requestIdleCallback` / `setTimeout` 异步 flush
- 页面关闭时 `sendBeacon`

### 风险 3：日志和反馈泄露敏感信息

规避：

- 严格白名单采集
- 服务端再脱敏
- JSON 字段长度限制
- 不采集复制正文和完整错误堆栈原文

### 风险 4：新功能影响现有帮助中心跳转

规避：

- 追踪层只包裹，不改原函数语义
- 成功与失败都不阻塞原始导航
- 先跑现有帮助中心回归，再加新增回归

## 测试与验收

### 单元测试

- 事件字段规范化
- 反馈状态机校验
- 跳转错误码归类
- 采样与开关逻辑

### 路由测试

- `/api/help-center/events/batch`
- `/api/help-center/feedback`
- `/api/help-center/analytics/*`

### 前端回归

必须覆盖：

- 帮助中心正常阅读不受影响
- 搜索不受影响
- 复制不受影响
- 上下文帮助跳转不受影响
- 开关关闭时页面行为与当前版本完全一致

### 验收标准

满足以下条件才允许上线：

1. 帮助中心现有 e2e 全量通过
2. 新增接口关闭时不产生额外请求
3. 开启埋点后，页面交互体感无明显卡顿
4. 新增表不会影响现有报表和日志查询
5. 反馈提交流程可闭环到管理员处理页
6. 跳转失败可按页面、文章、段落追查原因

## 推荐实施顺序与工期

建议按 3 个小版本推进：

### v1

- 埋点基础层
- 基础统计接口
- 开关与采样

### v2

- 文档反馈闭环
- 反馈工作台
- 与 bug report / admin operation logs 联动

### v3

- 跳转失败 trace
- 失败看板
- 热点问题文章排行

## 最后建议

这三块能力里，最应该先做的是“后台埋点统计基础层”。

原因：

- 它是文档反馈优先级排序和跳转失败分析的底座
- 先有数据，再决定哪些反馈真的高优先级
- 也最容易做到对现有功能零影响

推荐实际开发顺序：

1. 先上事件采集与开关
2. 再上文档反馈闭环
3. 最后上跳转失败专项追踪

这样风险最低，且每一阶段都能独立回滚。

## 配套实施稿

- [数据表与迁移设计稿](./HELP_CENTER_OBSERVABILITY_SCHEMA_20260325.md)
- [API 规格草案](./HELP_CENTER_OBSERVABILITY_API_SPEC_20260325.md)
- [前端事件字典](./HELP_CENTER_OBSERVABILITY_EVENT_DICTIONARY_20260325.md)
- [开发任务清单与回归矩阵](./HELP_CENTER_OBSERVABILITY_DELIVERY_PLAN_20260325.md)
