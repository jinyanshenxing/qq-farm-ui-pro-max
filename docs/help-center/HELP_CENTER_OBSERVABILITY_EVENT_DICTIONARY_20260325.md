# 帮助中心前端事件字典

## 目标

本稿用于约束帮助中心前端埋点事件的命名、触发时机、最小字段集和可选 `meta`。

目的：

- 避免事件命名漂移
- 避免前后端对同一事件理解不一致
- 避免采集过量或敏感数据

## 统一字段

所有事件都建议带以下公共字段：

- `eventNo`
- `eventType`
- `sessionId`
- `traceId`
- `articleId`
- `articleTitle`
- `articleCategory`
- `sectionId`
- `sectionTitle`
- `sourcePage`
- `sourceRoute`
- `sourceContext`
- `targetRoute`
- `audienceFilter`
- `quickFilter`
- `result`
- `errorCode`
- `latencyMs`
- `meta`

## 字段约束

### eventNo

- 每条事件唯一
- 建议格式：`HCE-<timestamp>-<random>`

### sessionId

- 同一浏览会话一致
- 可存在 `sessionStorage`

### traceId

- 普通阅读类事件可为空
- 跳转链路类事件必须有

### result

允许值：

- `success`
- `failed`
- `fallback`
- `cancelled`

### errorCode

仅失败相关事件使用：

- `article_not_found`
- `section_not_found`
- `route_not_found`
- `anchor_missing`
- `permission_denied`
- `page_not_ready_timeout`
- `context_mismatch`
- `router_cancelled`
- `unknown`

### meta

只允许轻量字段，例如：

- `searchKeyword`
- `copyKind`
- `routeName`
- `fromContextHelp`
- `fallbackUsed`

不允许放：

- 完整复制内容
- 长段日志
- 敏感 token
- 完整堆栈原文

## 事件列表

## 1. article_open

### 含义

帮助文章完成进入阅读态。

### 触发时机

- `selectedArticleId` 切换完成
- 文档正文开始加载时或成功进入文章态时

### 最小字段

- `articleId`
- `articleTitle`
- `articleCategory`
- `sourcePage`
- `sourceContext`

### meta 建议

- `openReason`: `nav_click / search_click / route_restore / recommendation / frequent_shortcut`

## 2. article_switch

### 含义

用户在帮助中心内部切换到另一篇文章。

### 触发时机

- 左侧目录点击
- 继续阅读点击
- 高频阅读点击
- 最近阅读点击
- 收藏置顶点击

### meta 建议

- `switchSource`: `nav / history / pinned / must_read / frequent / search`

## 3. search_submit

### 含义

用户在帮助中心发起一次搜索。

### 触发时机

- 输入框内容稳定后进入搜索态
- 或明确提交搜索

### meta 建议

- `searchKeyword`
- `keywordLength`

### 注意

- 超长搜索词建议裁剪
- 不记录完整大段文本

## 4. search_result_click

### 含义

用户点击搜索结果进入文章。

### meta 建议

- `searchKeyword`
- `resultRank`

## 5. copy_plain_text

### 含义

点击“复制纯文本”。

### meta 建议

- `copyKind`: `plain_text`

## 6. copy_markdown

### 含义

点击“复制 Markdown”。

### meta 建议

- `copyKind`: `markdown`

## 7. copy_code_block

### 含义

点击普通代码块复制。

### meta 建议

- `copyKind`: `code_block`
- `codeLanguage`

## 8. copy_command_block

### 含义

点击命令块复制。

### meta 建议

- `copyKind`: `command_block`
- `commandCategory`: `shell / docker / curl / env`

## 9. audience_filter_change

### 含义

阅读视角切换。

### meta 建议

- `fromFilter`
- `toFilter`

## 10. quick_filter_change

### 含义

左侧快速筛选切换。

### meta 建议

- `fromFilter`
- `toFilter`

## 11. outline_jump

### 含义

点击正文目录跳到具体段落。

### 最小字段

- `articleId`
- `sectionId`
- `sectionTitle`

## 12. related_route_click

### 含义

帮助中心内点击“关联页面”跳往业务页面。

### meta 建议

- `relatedRouteLabel`
- `targetRouteName`

## 13. context_help_open

### 含义

从业务页面点击“当前分类帮助 / 查看帮助”等入口进入帮助中心。

### 最小字段

- `sourcePage`
- `sourceRoute`
- `sourceContext`
- `articleId`

### sourceContext 建议值

- `settings_context_help`
- `accounts_context_help`
- `workflow_context_help`
- `system_logs_context_help`
- `announcement_context_help`

## 14. release_highlights_open

### 含义

点击版本演进卡片。

## 15. governance_template_copy

### 含义

复制治理模板。

### meta 建议

- `templateType`: `outdated / suggestion / task`

## 16. frequent_shortcut_click

### 含义

点击“高频阅读”卡片中的快捷入口。

### meta 建议

- `openCount`
- `lastOpenedBucket`

## 17. jump_intent

### 含义

一次帮助跳转链路开始。

### 说明

跳转专项事件必须带 `traceId`。

### 最小字段

- `traceId`
- `sourcePage`
- `sourceRoute`
- `sourceContext`
- `articleId`
- `sectionId`

## 18. jump_navigation_started

### 含义

路由导航已经开始。

## 19. jump_target_ready

### 含义

目标页面已就绪，可进行段落或锚点定位。

## 20. jump_completed

### 含义

跳转链路最终成功完成。

### 成功判定建议

- 帮助中心页面已进入目标文章
- 或目标业务页面已进入目标锚点
- 且段落 / 锚点确认可见

## 21. jump_failed

### 含义

跳转链路失败。

### 必填字段

- `traceId`
- `result`: `failed`
- `errorCode`

## 22. jump_fallback_used

### 含义

跳转主路径失败后，使用了 fallback。

### meta 建议

- `fallbackType`: `article_only / page_only / top_of_page / no_anchor`

## 推荐 sourcePage 枚举

- `help`
- `settings`
- `accounts`
- `workflow`
- `system_logs`
- `announcement_manager`
- `dashboard`
- `unknown`

## 推荐 sourceContext 枚举

- `help_nav`
- `help_outline`
- `help_related_route`
- `help_search_result`
- `help_must_read`
- `help_recent_history`
- `help_pinned`
- `help_frequent_usage`
- `help_governance_panel`
- `settings_context_help`
- `accounts_context_help`
- `workflow_context_help`
- `system_logs_context_help`
- `announcement_context_help`

## 前端接入建议

建议新增前端文件：

- `web/src/services/help-center-telemetry.ts`
- `web/src/services/help-center-jump-tracer.ts`

职责拆分：

- `help-center-telemetry.ts`
  负责通用事件入队、采样、批量 flush
- `help-center-jump-tracer.ts`
  负责跳转 trace、成功失败判定和 fallback 记录

## 开关建议

前端只认这几个配置：

- `telemetryEnabled`
- `jumpTracingEnabled`
- `telemetrySamplingRate`

关闭时：

- 所有方法返回 no-op
- 不额外发请求
- 不影响现有页面逻辑

## 事件字典维护原则

1. 新事件先加到这份字典
2. 事件名一旦上线不要轻易改
3. 新增 `meta` 字段要先确认不含敏感信息
4. 埋点需求变更优先新增字段，不要复用旧字段改变语义
