import { expect, test } from '@playwright/test'

function helpSectionId(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section'
}

async function mockAppApis(page: Parameters<typeof test.beforeEach>[0]['page']) {
  const ok = (data: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(data),
  })

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname

    if (path === '/api/auth/validate')
      return route.fulfill(ok({ ok: true, data: { user: { username: 'admin', role: 'admin' } } }))

    if (path === '/api/ui-config')
      return route.fulfill(ok({ ok: true, data: { siteTitle: 'QQ农场智能助手', supportQqGroup: '227916149' } }))

    if (path.startsWith('/api/view-preferences'))
      return route.fulfill(ok({ ok: true, data: { appSeenVersion: 'v4.5.25', announcementDismissedId: 'dismissed' } }))

    if (path === '/api/accounts') {
      return route.fulfill(ok({
        ok: true,
        data: {
          accounts: [
            {
              id: 'demo-1',
              name: '演示账号',
              username: 'demo',
              platform: 'qq',
              accountMode: 'main',
              running: false,
              connected: false,
            },
          ],
        },
      }))
    }

    if (path === '/api/account-selection')
      return route.fulfill(ok({ ok: true }))

    if (path === '/api/seeds') {
      return route.fulfill(ok({
        ok: true,
        data: [
          {
            seedId: 1001,
            name: '白萝卜种子',
            price: 100,
            requiredLevel: 1,
            locked: false,
          },
          {
            seedId: 1002,
            name: '胡萝卜种子',
            price: 180,
            requiredLevel: 3,
            locked: false,
          },
        ],
      }))
    }

    if (path === '/api/bag/plantable-seeds') {
      return route.fulfill(ok({
        ok: true,
        data: [
          {
            seedId: 1001,
            name: '白萝卜种子',
            usableCount: 18,
            locked: false,
          },
          {
            seedId: 1002,
            name: '胡萝卜种子',
            usableCount: 6,
            locked: false,
          },
        ],
      }))
    }

    if (path === '/api/settings') {
      return route.fulfill(ok({
        ok: true,
        data: {
          accountMode: 'main',
          harvestDelay: { min: 0, max: 0 },
          riskPromptEnabled: true,
          modeScope: { zoneScope: 'same_zone_only', requiresGameFriend: true, fallbackBehavior: 'standalone' },
          plantingStrategy: 'preferred',
          plantingFallbackStrategy: 'level',
          preferredSeedId: 0,
          bagSeedPriority: [],
          bagSeedFallbackStrategy: 'level',
          inventoryPlanting: { mode: 'disabled', globalKeepCount: 0, reserveRules: [] },
          intervals: {},
          friendQuietHours: { enabled: false, start: '23:00', end: '07:00' },
          stakeoutSteal: { enabled: false, delaySec: 3 },
          qqHighRiskWindow: { durationMinutes: 30, expiresAt: 0, lastIssuedAt: 0, lastAutoDisabledAt: 0 },
          tradeConfig: { sell: { keepMinEachFruit: 0, keepFruitIds: [] } },
          automation: {},
          reportConfig: {
            enabled: false,
            channel: 'webhook',
            endpoint: '',
            token: '',
            smtpHost: '',
            smtpPort: 465,
            smtpSecure: true,
            smtpUser: '',
            smtpPass: '',
            emailFrom: '',
            emailTo: '',
            title: '经营汇报',
            hourlyEnabled: false,
            hourlyMinute: 5,
            dailyEnabled: true,
            dailyHour: 21,
            dailyMinute: 0,
            retentionDays: 30,
          },
          ui: {},
          workflowConfig: {
            farm: { enabled: false, minInterval: 30, maxInterval: 120, nodes: [] },
            friend: { enabled: false, minInterval: 60, maxInterval: 300, nodes: [] },
          },
          offlineReminder: {
            channel: 'webhook',
            reloginUrlMode: 'none',
            endpoint: '',
            token: '',
            title: '账号下线提醒',
            msg: '账号下线',
            offlineDeleteEnabled: false,
            offlineDeleteSec: 1,
            webhookCustomJsonEnabled: false,
            webhookCustomJsonTemplate: '',
          },
        },
      }))
    }

    if (path === '/api/settings/timing-config') {
      return route.fulfill(ok({
        ok: true,
        data: {
          heartbeatIntervalMs: 25000,
          rateLimitIntervalMs: 600,
          ghostingProbability: 0.08,
          ghostingCooldownMin: 180,
          ghostingMinMin: 5,
          ghostingMaxMin: 25,
          inviteRequestDelay: 1500,
          schedulerEngine: 'default',
          optimizedSchedulerNamespaces: 'system-jobs',
          optimizedSchedulerTickMs: 100,
          optimizedSchedulerWheelSize: 512,
          readonlyTimingParams: [],
        },
      }))
    }

    if (path === '/api/trial-card-config')
      return route.fulfill(ok({ ok: true, data: { enabled: true, days: 1, dailyLimit: 50, cooldownMs: 14400000, adminRenewEnabled: true, userRenewEnabled: false, maxAccounts: 1 } }))

    if (path === '/api/admin/third-party-api')
      return route.fulfill(ok({ ok: true, data: { wxApiKey: '', wxApiUrl: '', wxAppId: '', ipad860Url: '', aineisheKey: '' } }))

    if (path === '/api/system-settings/health') {
      return route.fulfill(ok({
        ok: true,
        data: {
          ok: true,
          checkedAt: Date.now(),
          missingRequiredKeys: [],
          fallbackWouldActivateKeys: [],
          webAssets: {
            activeDir: '/opt/qq-farm-current/web/dist-runtime',
            activeSource: 'preview',
            selectionReason: 'preview',
            selectionReasonLabel: '预览模式',
            buildTargetDir: '/opt/qq-farm-current/web/dist-runtime',
            buildTargetSource: 'runtime',
            defaultDir: '/opt/qq-farm-current/web/dist',
            defaultHasAssets: true,
            defaultWritable: true,
            fallbackDir: '/opt/qq-farm-current/web/dist-runtime',
            fallbackHasAssets: true,
            fallbackWritable: true,
          },
        },
      }))
    }

    if (path === '/api/qq-friend-diagnostics') {
      return route.fulfill(ok({
        ok: true,
        data: {
          file: '',
          fileName: '',
          appid: '1112386029',
          createdAt: new Date().toISOString(),
          qqVersion: '9.9.0',
          miniProject: { appid: '1112386029', projectname: 'QQ农场', openDataContext: true },
          authBridge: { authoritySynchronized: true, shareFriendshipScope: 1, getAuthStatusSeen: true, setAuthStatusSeen: true },
          hostFriendProtocol: {
            reqCount: 1,
            rspCount: 1,
            latestRequest: { selfUid: '10001', startIndex: 0, socialStyle: 1, socialSwitch: 1, hasLocal: 1 },
            latestResponse: { onlineInfoCount: 12 },
          },
          summary: { protocolLikely: 'qq-host-bridge', latestOnlineInfoCount: 12, cacheAccountCount: 1, cacheFriendCount: 12 },
          redisCaches: [],
          source: null,
          availableFiles: [],
        },
      }))
    }

    if (path === '/api/admin/cluster-config')
      return route.fulfill(ok({ ok: true, data: { dispatcherStrategy: 'round_robin' } }))

    if (path === '/api/admin/system-update/overview') {
      const now = Date.now()
      return route.fulfill(ok({
        ok: true,
        data: {
          currentVersion: 'v4.5.25',
          latestRelease: {
            version: '4.5.25',
            versionTag: 'v4.5.25',
            title: 'v4.5.25',
            publishedAt: now,
            prerelease: false,
            notes: '最新版本说明',
            url: 'https://example.com/releases/v4.5.25',
            source: 'github',
            assets: [],
          },
          hasUpdate: false,
          comparison: 0,
          releaseCache: {
            checkedAt: now,
            source: 'https://api.github.com/repos/smdk000/qq-farm-ui-pro-max/releases/latest',
            etag: 'demo-etag',
            lastError: '',
            latestRelease: {
              version: '4.5.25',
              versionTag: 'v4.5.25',
              title: 'v4.5.25',
              publishedAt: now,
              prerelease: false,
              notes: '最新版本说明',
              url: 'https://example.com/releases/v4.5.25',
              source: 'github',
              assets: [],
            },
            releases: [],
          },
          runtime: {
            lastCheckAt: now,
            lastCheckOk: true,
            lastError: '',
            activeJobId: 0,
            activeJobStatus: '',
            activeJobKey: '',
            activeTargetVersion: '',
            agentSummary: [],
            clusterNodes: [],
          },
          config: {
            provider: 'github_release',
            manifestUrl: '',
            releaseApiUrl: '',
            githubOwner: 'smdk000',
            githubRepo: 'qq-farm-ui-pro-max',
            channel: 'stable',
            allowPreRelease: false,
            preferredStrategy: 'rolling',
            preferredScope: 'app',
            requireDrain: false,
            agentMode: 'db_polling',
            agentPollIntervalSec: 15,
            defaultDrainNodeIds: [],
            maintenanceWindow: '',
            autoSyncAnnouncements: true,
            autoRunVerification: true,
            promptRollbackOnFailure: true,
            defaultLogTailLines: 80,
          },
          activeJob: null,
          activeBatch: null,
          latestSmokeSummary: {
            status: 'warning',
            checkedAt: now,
            checkedAtLabel: '2026-03-25 21:30:00',
            baseUrl: 'http://127.0.0.1:9527',
            authMode: 'login cookie',
            targetVersion: 'v4.5.25',
            targetScope: 'app',
            targetStrategy: 'rolling',
            targetAgents: '未指定',
            verifyTarget: '/opt/qq-farm-current',
            passCount: 6,
            warnCount: 1,
            failCount: 0,
            passItems: ['更新概览接口可用：当前 v4.5.25，最新 v4.5.25。'],
            warnItems: ['更新预检返回阻断：阻断 1 项，提醒 0 项。'],
            failItems: [],
            rawFiles: ['04-system-update-overview.json', '07-system-update-preflight.json'],
            reportDir: '/opt/qq-farm-current/reports/system-update-smoke/20260325_213000',
            summaryPath: '/opt/qq-farm-current/reports/system-update-smoke/20260325_213000/SUMMARY.md',
          },
          drainCutoverReadiness: {
            checkedAt: now,
            canDrainCutover: true,
            targetNodeIds: [],
            runningAccountCount: 0,
            targetedRunningAccountCount: 0,
            blockerCount: 0,
            reloginRequiredCount: 0,
            blockers: [],
          },
        },
      }))
    }

    if (path === '/api/admin/system-update/jobs')
      return route.fulfill(ok({ ok: true, data: { jobs: [], batches: [] } }))

    if (path === '/api/system-logs')
      return route.fulfill(ok({ ok: true, data: { list: [], total: 0, page: 1, pageSize: 20 } }))

    if (path === '/api/reports/history') {
      return route.fulfill(ok({
        ok: true,
        data: {
          items: [],
          page: 1,
          pageSize: 3,
          total: 0,
          totalPages: 1,
        },
      }))
    }

    if (path === '/api/reports/history/stats') {
      return route.fulfill(ok({
        ok: true,
        data: {
          total: 0,
          successCount: 0,
          failedCount: 0,
          testCount: 0,
          hourlyCount: 0,
          dailyCount: 0,
        },
      }))
    }

    if (path === '/api/announcement')
      return route.fulfill(ok({ ok: true, data: [] }))

    if (path === '/api/users')
      return route.fulfill(ok({ ok: true, data: [{ id: 1, username: 'admin', role: 'admin' }] }))

    return route.fulfill(ok({ ok: true, data: {} }))
  })

  await page.addInitScript(() => {
    localStorage.setItem('admin_token', 'admin')
    localStorage.setItem('current_user', JSON.stringify({ username: 'admin', role: 'admin' }))
    localStorage.setItem('app_seen_version', 'v4.5.25')
    localStorage.setItem('announcement_dismissed_id', 'dismissed')
  })
}

async function dismissBlockingDialogs(page: Parameters<typeof test.beforeEach>[0]['page']) {
  const confirmButton = page.getByRole('button', { name: '我知道了，立即体验' })
  if (await confirmButton.isVisible().catch(() => false))
    await confirmButton.click()
}

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await mockAppApis(page)
})

test('supports article switching and full-text search', async ({ page }) => {
  await page.goto('/help?article=settings-overview&audience=all', { waitUntil: 'domcontentloaded' })
  await dismissBlockingDialogs(page)

  await expect(page.locator('.help-hero__title')).toHaveText('设置页总览')

  await page.locator('#help-search-input').fill('排空')
  await expect(page.locator('.help-result-card').filter({ hasText: '系统更新中心与集群更新' })).toBeVisible()

  await page.locator('.help-result-card').filter({ hasText: '系统更新中心与集群更新' }).click()
  await expect(page.locator('.help-hero__title')).toHaveText('系统更新中心与集群更新')
  await expect(page).toHaveURL(/article=system-update-center/)

  await page.locator('#help-search-input').fill('远程更新')
  const remoteUpdateResultTitle = page.locator('.help-result-card__title').filter({ hasText: '从本地发版到服务器远程更新' })
  await expect(remoteUpdateResultTitle).toHaveCount(1)
  await expect(remoteUpdateResultTitle.first()).toBeVisible()
})

test('supports release-to-remote-update checklist article', async ({ page }) => {
  await page.goto('/help?article=deployment-release-and-remote-update&audience=admin', { waitUntil: 'domcontentloaded' })
  await dismissBlockingDialogs(page)

  await expect(page.locator('.help-hero__title')).toHaveText('从本地发版到服务器远程更新')
  await expect(page.getByText('远程更新只会读取已经发布到版本源的版本')).toBeVisible()
  await expect(page.locator('.help-route-chip').filter({ hasText: '更新中心 · 总览配置' })).toBeVisible()
})

test('surfaces quick release checklist help in system update settings', async ({ page }) => {
  await page.goto('/settings?category=advanced&advancedSection=update&updateTab=overview#settings-update-overview', { waitUntil: 'domcontentloaded' })
  await dismissBlockingDialogs(page)

  await expect(page.getByText('远程更新准备度')).toBeVisible()
  await expect(page.getByText('发布版本源')).toBeVisible()
  await expect(page.getByText('更新代理心跳')).toBeVisible()
  await expect(page.getByText('未检测到在线更新代理')).toBeVisible()
  await expect(page.getByText('最近 smoke 联动检查')).toBeVisible()
  await expect(page.getByText('通过 6 · 提醒 1 · 失败 0')).toBeVisible()
  await expect(page.getByText('更新预检返回阻断：阻断 1 项，提醒 0 项。')).toBeVisible()
  await expect(page.getByRole('button', { name: '复制重跑 smoke 命令' })).toBeVisible()

  await expect(page.getByRole('button', { name: '复制修复命令' })).toBeVisible()
  await expect(page.getByRole('button', { name: '复制代理安装命令' })).toBeVisible()
  await expect(page.getByRole('button', { name: '复制 smoke 命令' })).toBeVisible()

  await page.getByRole('button', { name: '复制 smoke 命令' }).click()
  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toContain('smoke-system-update-center.sh')

  const checklistButton = page.getByRole('button', { name: '最短发布清单' }).first()
  await expect(checklistButton).toBeVisible()
  await checklistButton.click()

  await expect(page).toHaveURL(/article=deployment-release-and-remote-update/)
  await expect.poll(() => decodeURIComponent(page.url())).toContain(`section=${helpSectionId('最短发布清单')}`)
  await expect(page.locator('.help-hero__title')).toHaveText('从本地发版到服务器远程更新')
})

test('supports command copy and governance task copy', async ({ page }) => {
  await page.goto('/help?article=deployment-update-and-recovery&audience=admin', { waitUntil: 'domcontentloaded' })
  await dismissBlockingDialogs(page)

  const commandCopyButton = page.locator('[data-help-copy-kind=\"command\"]').first()
  await expect(commandCopyButton).toBeVisible()
  await commandCopyButton.click()
  let copiedCommand = ''
  await expect.poll(async () => {
    copiedCommand = await page.evaluate(() => navigator.clipboard.readText())
    return copiedCommand.length > 0
  }).toBeTruthy()
  expect(copiedCommand.length).toBeGreaterThan(0)
  expect(copiedCommand.includes('/opt/qq-farm-current') || copiedCommand.includes('.sh')).toBeTruthy()

  await page.getByRole('button', { name: '复制治理任务' }).click()
  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toContain('# 帮助中心治理任务')
  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toContain('HC-DEPLOYMENT-UPDATE-AND-RECOVERY')
})

test('navigates between settings anchors and contextual help anchors', async ({ page }) => {
  await page.goto('/settings?category=advanced&advancedSection=update&updateTab=jobs#settings-update-jobs', { waitUntil: 'domcontentloaded' })
  await dismissBlockingDialogs(page)

  await expect(page).toHaveURL(/advancedSection=update/)
  await expect(page).toHaveURL(/updateTab=jobs/)
  const contextHelpEntry = page.locator('.settings-primary-category').locator('a,button').filter({ hasText: '当前分类帮助' }).first()
  await expect(contextHelpEntry).toBeVisible()

  await contextHelpEntry.click()
  await expect(page).toHaveURL(/article=system-update-center/)
  await expect.poll(() => decodeURIComponent(page.url())).toContain(`section=${helpSectionId('任务执行')}`)
  await expect(page.locator('.help-outline-item--active')).toContainText('任务执行')

  await page.locator('.help-route-chip').filter({ hasText: '更新中心 · 任务执行' }).click()
  await expect.poll(() => page.url()).toContain('/settings?category=advanced')
  await expect.poll(() => page.url()).toContain('advancedSection=update')
  await expect.poll(() => page.url()).toContain('updateTab=jobs')
  await expect.poll(() => page.url()).toContain('#settings-update-jobs')
})

test('persists quick filters and supports clearing favorites and reading history', async ({ page }) => {
  await page.goto('/help?article=quick-start&audience=all', { waitUntil: 'domcontentloaded' })
  await dismissBlockingDialogs(page)

  await expect(page.locator('.help-hero__title')).toHaveText('快速上手')
  await page.locator('.help-nav [data-help-article-id="workspace-overview"]').click()
  await expect(page.locator('.help-hero__title')).toHaveText('面板与页面导航')

  await page.locator('.help-sidebar-quick-filters').getByRole('button', { name: /^已读/ }).click()
  await expect(page).toHaveURL(/quick=visited/)
  await page.locator('.help-nav-status__actions').getByRole('button', { name: '重置已读' }).click()
  await expect(page.locator('.help-nav-history')).toBeHidden()
  await expect(page.locator('.help-nav-group__count--progress').first()).toContainText('1/')

  await page.locator('.help-sidebar-quick-filters').getByRole('button', { name: /^收藏/ }).click()
  await expect(page).toHaveURL(/quick=pinned/)
  await expect(page.locator('.help-nav-empty')).toBeVisible()

  await page.locator('.help-nav-empty__actions').getByRole('button', { name: '收藏当前' }).click()
  await expect(page.locator('.help-nav-pins')).toBeVisible()
  await expect(page.locator('.help-nav-item--active')).toContainText('面板与页面导航')

  await page.reload({ waitUntil: 'domcontentloaded' })
  await dismissBlockingDialogs(page)
  await expect(page).toHaveURL(/quick=pinned/)
  await expect(page.locator('.help-nav-pins')).toBeVisible()

  await page.locator('.help-nav-pins').getByRole('button', { name: '清空' }).click()
  await expect(page.locator('.help-nav-empty')).toBeVisible()

  await page.locator('.help-nav-empty__actions').getByRole('button', { name: '查看全部' }).click()
  await expect(page).not.toHaveURL(/quick=/)
  await expect(page.locator('.help-nav-item--active')).toContainText('面板与页面导航')
})

test('surfaces frequent article shortcuts and allows resetting usage preferences', async ({ page }) => {
  await page.goto('/help?article=quick-start&audience=all', { waitUntil: 'domcontentloaded' })
  await dismissBlockingDialogs(page)

  await expect(page.locator('.help-usage-card')).toBeHidden()
  await page.locator('.help-nav [data-help-article-id="workspace-overview"]').click()

  await expect(page.locator('.help-usage-card')).toBeVisible()
  await expect(page.locator('.help-usage-item').first()).toContainText('快速上手')

  await page.locator('.help-usage-card__action').evaluate((element: HTMLButtonElement) => element.click())
  await expect(page.locator('.help-usage-card')).toBeHidden()
})
