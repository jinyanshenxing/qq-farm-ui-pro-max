import { expect, test } from '@playwright/test'

import { dismissBlockingDialogs, mockAdminAppApis } from './support/mock-admin-app'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.confirm = () => true
  })

  await mockAdminAppApis(page)
})

test('shows clustered batch detail with node phases and failure categories', async ({ page }) => {
  await page.goto('/settings?category=advanced&advancedSection=update&updateTab=jobs#settings-update-jobs', { waitUntil: 'domcontentloaded' })
  await dismissBlockingDialogs(page)

  await expect(page.getByText('集群批次详情')).toBeVisible()
  await expect(page.getByText('核验失败 1')).toBeVisible()
  await expect(page.locator('#settings-update-jobs').getByText('worker-a', { exact: true })).toBeVisible()
  await expect(page.locator('#settings-update-jobs').getByText('verify-stack.sh exited with non-zero status').first()).toBeVisible()
  await expect(page.getByText('单机任务详情')).toBeVisible()
  await expect(page.getByText('核验日志：/opt/qq-farm-current/logs/update-job-301-verify.log')).toBeVisible()
})

test('supports rollback creation and drain recovery from the update center', async ({ page }) => {
  await page.goto('/settings?category=advanced&advancedSection=update&updateTab=jobs#settings-update-jobs', { waitUntil: 'domcontentloaded' })
  await dismissBlockingDialogs(page)

  await page.getByRole('button', { name: '创建回滚任务' }).first().click()
  await expect(page.getByText('已创建回滚任务，目标版本 v4.5.25')).toBeVisible()
  await page.getByRole('button', { name: '知道了' }).click()

  await page.goto('/settings?category=advanced&advancedSection=update&updateTab=nodes#settings-update-nodes', { waitUntil: 'domcontentloaded' })
  await dismissBlockingDialogs(page)

  await expect(page.getByText('集群节点排空', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '恢复接流' }).click()
  await expect(page.getByText('节点 worker-b 已恢复接流')).toBeVisible()
})
