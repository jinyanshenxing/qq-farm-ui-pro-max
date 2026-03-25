# 更新、修复与回滚

当前版本的升级链路已经围绕“统一更新、先修骨架、再修数据库、最后切版本”组织。

如果你要的是“本地改完代码以后，怎样发版，再让服务器远程更新”的一条最短主线，先看 [从本地发版到服务器远程更新](/help?article=deployment-release-and-remote-update&audience=admin)。

## 先记住一个前提

后台远程更新读取的是已经发布到版本源的版本，不是你本地电脑里的最新代码。

- 还没推到远端仓库的代码，服务器检查不到
- 还没推送成功的镜像，服务器也拉不到
- 还没生成 tag / Release / 自定义版本源记录时，更新中心不会提示新版本

## 标准更新

### 统一更新入口

```bash
/opt/qq-farm-current/install-or-update.sh --action update --preserve-current
```

### 只更新主程序

```bash
cd /opt/qq-farm-current
bash update-app.sh
```

### 第一次启用远程更新前的准备

```bash
cd /opt/qq-farm-current
bash repair-deploy.sh --backup
bash install-update-agent-service.sh
systemctl status qq-farm-update-agent
```

如果已经启用宿主机更新代理，更推荐直接在“系统更新中心”创建任务，让更新过程自动记录：

- preflight 摘要
- 当前执行 phase
- verify 结果
- 公告同步结果
- 回滚候选信息

如果要在真实环境发版前先做一轮“只检查不执行”的联动验收，可以运行：

```bash
cd /opt/qq-farm-current
bash smoke-system-update-center.sh \
  --base-url http://127.0.0.1:9527 \
  --username admin \
  --password '你的管理员密码' \
  --deploy-dir /opt/qq-farm-current
```

这条 smoke 不会创建更新任务，主要会检查：

- 登录与管理员鉴权
- 更新中心概览 / 检查更新
- 公告同步 dry-run 预览
- 独立 preflight
- 最近任务详情与回滚候选
- 宿主机 `verify-stack.sh`

### 升级前先做兜底

```bash
cd /opt/qq-farm-current
bash safe-update.sh
```

## 旧服务器修复

如果你的部署目录缺脚本、缺 current 链接、缺新的 compose 模板，可以先修部署骨架：

```bash
cd /opt/qq-farm-current 2>/dev/null || cd /opt/qq-farm-bot-current 2>/dev/null || cd /opt
curl -fsSLo repair-deploy.sh https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy/repair-deploy.sh
chmod +x repair-deploy.sh
./repair-deploy.sh --backup
```

## 数据库结构修复

```bash
cd /opt/qq-farm-current
bash repair-mysql.sh --backup
```

## 离线更新

```bash
cd /opt/qq-farm-current
bash update-app.sh --image-archive /root/qq-farm-bot-images-amd64.tar.gz
```

## 常见升级顺序

1. 先 `repair-deploy.sh`
2. 再 `repair-mysql.sh`
3. 再 `safe-update.sh` 或 `update-app.sh`
4. 最后 `verify-stack.sh`
5. 如果下一次还想直接在后台远程更新，确认 `qq-farm-update-agent` 仍然在线

## 回滚建议

如果本次更新通过后台“系统更新中心”发起，优先使用页面里的“创建回滚任务”入口，而不是直接 SSH 手工回退。

这样可以保留：

- 原任务与回滚任务的关联关系
- 回滚阶段日志
- verify 结果
- 管理员审计记录

## 当前版本的兼容点

- 会维护 `/opt/qq-farm-current`
- 也兼容历史 `/opt/qq-farm-bot-current`
- 更新脚本会继续同步新的部署辅助脚本

## 历史裸机脚本

旧版裸机脚本仍可作为历史兼容参考，但不再是当前推荐主线。

### 轻量守护脚本

```bash
./farm-bot.sh start
./farm-bot.sh stop
./farm-bot.sh restart
./farm-bot.sh status
```

### 查看守护日志

```bash
tail -f logs/farm-bot.log
```

### 说明

- 这套方式适合历史环境或轻量测试。
- 当前生产部署更推荐统一 Docker 安装与更新链路。
