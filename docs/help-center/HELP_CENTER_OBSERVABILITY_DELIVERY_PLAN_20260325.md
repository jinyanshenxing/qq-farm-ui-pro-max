# 帮助中心可观测性开发任务清单与回归矩阵

## 文档目的

本稿用于把帮助中心可观测性方案进一步拆成可实施任务，覆盖：

- 开发任务清单
- 文件改动清单
- 回归测试矩阵
- 灰度上线与回滚要求

本稿默认遵守一个前提：

- 不影响当前帮助中心已上线能力
- 不改写现有路由语义
- 不改变现有页面视觉结构与交互节奏

## 范围边界

### 本轮允许新增

- 帮助中心专属后端表
- 帮助中心专属后端服务与路由
- 帮助中心专属前端 telemetry / trace service
- 管理端帮助中心统计与反馈工作台
- 与现有 bug report / admin operation logs 的桥接逻辑

### 本轮不应改动

- 现有帮助中心 Markdown 文档内容结构
- 现有帮助中心目录、搜索、复制、文章渲染主逻辑
- 现有 `/api/bug-report/*` 返回结构
- 现有 `/api/admin-operation-logs` 返回结构
- 现有 `/api/system-logs` 返回结构
- 现有上下文帮助跳转的主路径语义

### 允许的改动方式

- 只在外围包埋点
- 只新增配置开关
- 只新增管理页或 analytics 子卡片
- 只新增回归，不删除现有帮助中心回归

## 交付节奏

建议按 3 个开发批次交付。

## 批次一：埋点基础层

### 目标

- 把帮助中心事件采集通路打通
- 不引入重 UI
- 不改变现有页面功能

### 后端任务

1. 新增迁移 `021-help-center-events.sql`
2. 新增帮助中心 observability 配置读取与保存能力
3. 新增事件批量写入服务
4. 新增事件批量接收路由
5. 新增管理员概览接口
6. 新增事件离线聚合任务骨架

### 前端任务

1. 新增帮助中心 telemetry 客户端
2. 帮助中心页面接入埋点包装
3. 上下文帮助按钮接入埋点包装
4. 复制、搜索、筛选、文章切换接入埋点
5. 开关关闭时所有埋点 no-op

### 管理端任务

1. 新增帮助中心 observability 设置入口
2. 新增 overview 卡片或 analytics 子页

### 完成定义

- 事件能批量写库
- 开关关闭时没有额外请求
- 开关开启时不影响帮助中心阅读与跳转

## 批次二：文档反馈闭环

### 目标

- 从“复制反馈模板”升级到“提交反馈并可跟踪”

### 后端任务

1. 新增迁移 `022-help-center-feedback.sql`
2. 新增反馈 service
3. 新增反馈列表、详情、状态更新、分派、桥接接口
4. 反馈状态变更写入 `admin_operation_logs`
5. 需要时支持升级成 `bug_report`

### 前端任务

1. 帮助中心治理面板新增“提交反馈”入口
2. 新增反馈弹窗或轻表单
3. 自动预填文章、段落、当前视角、来源页面
4. 管理员新增反馈工作台

### 管理端任务

1. 反馈列表筛选
2. 反馈详情查看
3. 状态流转
4. 分派与关联 bug report

### 完成定义

- 普通用户能提交
- 管理员能查看、更新、分派
- 全链路不影响现有模板复制入口

## 批次三：跳转失败链路采集

### 目标

- 看见“帮助入口点了但没真正到达”的问题

### 后端任务

1. 复用事件表承接 jump trace
2. 必要时新增 `024-help-center-jump-daily.sql`
3. 新增跳转失败统计接口

### 前端任务

1. 新增 jump tracer
2. 包装 `syncSelectedArticle`
3. 包装 `jumpToOutline`
4. 包装上下文帮助入口
5. 包装帮助中心到业务页的关联跳转
6. 增加成功 / 失败 / fallback 上报

### 管理端任务

1. 新增跳转失败热点卡
2. 新增来源页面失败排行
3. 新增目标文章 / 段落失败排行

### 完成定义

- 可按来源页面查失败
- 可按文章和段落查失败
- 可看到 fallback 是否生效

## 文件改动清单

## 一、后端预计新增文件

### 迁移

- `core/src/database/migrations/021-help-center-events.sql`
- `core/src/database/migrations/022-help-center-feedback.sql`
- `core/src/database/migrations/023-help-center-event-daily.sql`
- `core/src/database/migrations/024-help-center-jump-daily.sql`

### 服务

- `core/src/services/help-center-event-service.js`
- `core/src/services/help-center-feedback-service.js`
- `core/src/services/help-center-analytics-service.js`

### 控制器

- `core/src/controllers/admin/help-center-observability-routes.js`
- `core/src/controllers/admin/help-center-feedback-routes.js`
- `core/src/controllers/admin/help-center-analytics-routes.js`

### 测试

- `core/__tests__/help-center-event-service.test.js`
- `core/__tests__/help-center-feedback-service.test.js`
- `core/__tests__/help-center-observability-routes.test.js`
- `core/__tests__/help-center-feedback-routes.test.js`
- `core/__tests__/help-center-analytics-routes.test.js`

## 二、后端预计修改文件

### 路由注册

- [admin.js](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/core/src/controllers/admin.js)

用途：

- 注册新的帮助中心 observability / feedback / analytics 路由

### 系统设置

- [system-settings.js](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/core/src/services/system-settings.js)

用途：

- 新增 `help_center_observability_config` key 的使用

### 设置页偏好或设置路由

- [settings-report-routes.js](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/core/src/controllers/admin/settings-report-routes.js)

用途：

- 如需把帮助中心 observability 配置放进现有设置体系，可在此或独立新路由文件中接入

### 审计桥接

- [admin-operation-logs.js](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/core/src/services/admin-operation-logs.js)

用途：

- 只扩充 `scope` 白名单时才需要改
- 建议新增 `help_center` scope

### bug report 桥接

- [bug-report-service.js](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/core/src/services/bug-report-service.js)

用途：

- 文档反馈升级成 bug report 时做桥接
- 不改现有主提交逻辑

## 三、前端预计新增文件

### 服务

- `web/src/services/help-center-telemetry.ts`
- `web/src/services/help-center-jump-tracer.ts`
- `web/src/services/help-center-feedback.ts`

### 类型

- `web/src/types/help-center-observability.ts`

### 管理端页面

- `web/src/views/HelpCenterAnalytics.vue`
- `web/src/views/HelpCenterFeedback.vue`

### 组件

- `web/src/components/help/HelpFeedbackDialog.vue`
- `web/src/components/help/HelpCenterMetricsPanel.vue`

### 前端测试

- `web/e2e/help-center-observability.spec.ts`
- `web/e2e/help-center-feedback.spec.ts`

## 四、前端预计修改文件

### 主页面

- [HelpCenter.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/HelpCenter.vue)

用途：

- 接 telemetry
- 接 jump trace
- 接反馈入口
- 接高层统计入口

### 上下文帮助按钮

- [ContextHelpButton.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/components/help/ContextHelpButton.vue)

用途：

- 上报 `context_help_open`
- 带 `sourceContext`

### API 入口

- [index.ts](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/api/index.ts)

用途：

- 一般不改
- 仅在需要统一 keepalive / telemetry 特例时评估是否改

### 已有回归

- [help-center.regression.spec.ts](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/e2e/help-center.regression.spec.ts)

用途：

- 保留现有用例
- 补充“不受影响”的回归

## 五、尽量不要碰的文件

- `web/src/components/help/HelpArticleBody.vue`
- `web/src/data/help-center.ts`
- `web/src/content/help-center/*.md`

原因：

- 本轮目标是可观测性和闭环，不是再次大改内容渲染和文档源

## 任务拆分建议

## 后端开发包 A：埋点与统计

负责人范围：

- 迁移
- event service
- analytics service
- overview / article / source page 接口

交付文件：

- `021`
- `023`
- 事件 / 统计 service
- observability routes

## 后端开发包 B：反馈闭环

负责人范围：

- `022`
- feedback service
- feedback routes
- bug report 桥接
- admin operation log 桥接

## 前端开发包 A：埋点与追踪

负责人范围：

- telemetry service
- jump tracer
- HelpCenter 接入
- ContextHelpButton 接入

## 前端开发包 B：反馈与管理页

负责人范围：

- HelpFeedbackDialog
- HelpCenterFeedback 页面
- HelpCenterAnalytics 页面

## 回归测试矩阵

## A. 现有功能不受影响矩阵

这些是必须继续保持通过的：

1. 帮助文章切换正常
2. 全文搜索正常
3. 命令复制正常
4. Markdown 复制正常
5. 目录跳转正常
6. 上下文帮助跳转正常
7. 设置页锚点互跳正常
8. 快速筛选 URL 持久化正常
9. 收藏 / 已读 / 最近阅读正常
10. 高频阅读入口正常

## B. 新增埋点矩阵

### 前端行为

1. 开关关闭时不发送埋点请求
2. 开关开启时发送批量埋点请求
3. 埋点失败不影响页面跳转
4. 埋点失败不影响复制
5. 埋点失败不影响搜索

### 后端行为

1. 单批事件写入成功
2. 非法事件被忽略但整批不报错
3. 重复 `eventNo` 幂等
4. 管理员可读 overview
5. 普通用户无权读 analytics

## C. 新增反馈闭环矩阵

### 提交侧

1. 反馈开关关闭时入口不可见或提交被拒绝
2. 普通用户可提交文档反馈
3. 自动带上文章与段落上下文
4. 限流生效

### 管理侧

1. 管理员可查询反馈列表
2. 可查看单条详情
3. 可更新状态
4. 可分派负责人
5. 可关联 bug report
6. 操作后写入 admin operation logs

## D. 跳转链路矩阵

1. 上下文帮助成功跳转时记录 `jump_completed`
2. 锚点不存在时记录 `jump_failed`
3. fallback 生效时记录 `jump_fallback_used`
4. 跳转 trace 不影响原跳转结果

## E. 数据正确性矩阵

1. `help_center_events` 不写敏感正文
2. `help_center_feedback` 不保存敏感配置值
3. 聚合结果与原始事件数量基本一致
4. 时间范围筛选正确
5. 角色筛选正确

## F. 性能矩阵

1. 开启埋点后帮助中心打开无明显卡顿
2. 快速切换文章不出现明显阻塞
3. 批量埋点 flush 不阻塞主线程

## 推荐测试文件拆分

### 核心后端测试

- `core/__tests__/help-center-event-service.test.js`
- `core/__tests__/help-center-feedback-service.test.js`
- `core/__tests__/help-center-analytics-routes.test.js`
- `core/__tests__/help-center-feedback-routes.test.js`

### 前端 e2e

- `web/e2e/help-center.regression.spec.ts`
- `web/e2e/help-center-observability.spec.ts`
- `web/e2e/help-center-feedback.spec.ts`

## 灰度与上线步骤

1. 先上线数据库迁移与后端路由，但开关关闭
2. 前端埋点代码上线，仍保持开关关闭
3. 管理员账号灰度开启 telemetry
4. 观察事件写入量、错误率、页面性能
5. 再灰度开启反馈闭环
6. 最后灰度开启 jump tracing

## 回滚策略

### 最快回滚

- 关闭 `help_center_observability_config` 开关

### 前端回滚

- 保留代码，关闭开关即可退回当前行为

### 后端回滚

- 路由可保留
- 表可保留
- 停止写入即可

### 不建议回滚方式

- 不建议回滚数据库迁移
- 不建议删除新表

## 最终验收门槛

满足以下条件才算可以进入正式开发：

1. 文件改动边界明确
2. 回归矩阵覆盖现有帮助中心主能力
3. 配置开关与灰度顺序明确
4. 回滚路径明确
5. 所有新增能力都能在“关闭时零影响”

满足以下条件才算可以上线：

1. 现有帮助中心 e2e 全过
2. 新增 observability e2e 全过
3. 埋点错误不影响主流程
4. 反馈闭环可从提交走到管理员处理
5. 跳转失败可在后台定位到来源与错误码
