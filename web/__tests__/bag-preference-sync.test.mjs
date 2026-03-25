import assert from 'node:assert/strict'
import test from 'node:test'

const {
  getBagPreferencesSyncState,
  hasBagPreferencesData,
  resolveBagPreferencesHydrationMode,
  setBagPreferencesSyncState,
} = await import('../src/utils/bag-preference-sync.ts')

function createMemoryStorage() {
  const store = new Map()
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
  }
}

test('dirty local bag preferences win over stale remote snapshot, even when local payload is empty', () => {
  const mode = resolveBagPreferencesHydrationMode({
    localPayload: {
      purchaseMemory: {},
      activityHistory: [],
    },
    remotePayload: {
      purchaseMemory: {
        'mall:gift:1001': {
          count: 3,
          lastPurchasedAt: 123,
          name: '礼包',
        },
      },
      activityHistory: [{ id: 'server' }],
    },
    syncState: {
      dirty: true,
      updatedAt: 100,
    },
  })

  assert.equal(mode, 'prefer_local_dirty')
})

test('bag preferences hydration falls back to remote or local migration as expected', () => {
  assert.equal(resolveBagPreferencesHydrationMode({
    localPayload: {
      purchaseMemory: {
        'mall:gift:1001': {
          count: 1,
          lastPurchasedAt: 123,
          name: '礼包',
        },
      },
      activityHistory: [],
    },
    remotePayload: {
      purchaseMemory: {},
      activityHistory: [{ id: 'remote' }],
    },
    syncState: { dirty: false },
  }), 'prefer_remote')

  assert.equal(resolveBagPreferencesHydrationMode({
    localPayload: {
      purchaseMemory: {
        'mall:gift:1002': {
          count: 2,
          lastPurchasedAt: 456,
          name: '月卡',
        },
      },
      activityHistory: [],
    },
    remotePayload: {
      purchaseMemory: {},
      activityHistory: [],
    },
    syncState: { dirty: false },
  }), 'migrate_local')

  assert.equal(resolveBagPreferencesHydrationMode({
    localPayload: {
      purchaseMemory: {},
      activityHistory: [],
    },
    remotePayload: {
      purchaseMemory: {},
      activityHistory: [],
    },
    syncState: { dirty: false },
  }), 'empty')
})

test('bag preference sync state persists per account and keeps dirty flag until a later successful sync', () => {
  const storage = createMemoryStorage()
  const storageKey = 'qq-farm.bag.preferences-sync-state.v1'

  assert.deepEqual(getBagPreferencesSyncState(storage, storageKey, '1001'), {
    dirty: false,
    updatedAt: 0,
    lastSyncedAt: 0,
  })

  const dirtyState = setBagPreferencesSyncState(storage, storageKey, '1001', {
    dirty: true,
    updatedAt: 321,
  })
  assert.deepEqual(dirtyState, {
    dirty: true,
    updatedAt: 321,
    lastSyncedAt: 0,
  })

  assert.equal(hasBagPreferencesData({
    purchaseMemory: {},
    activityHistory: [],
  }), false)

  assert.deepEqual(getBagPreferencesSyncState(storage, storageKey, '1001'), {
    dirty: true,
    updatedAt: 321,
    lastSyncedAt: 0,
  })

  const syncedState = setBagPreferencesSyncState(storage, storageKey, '1001', {
    dirty: false,
    lastSyncedAt: 654,
  })
  assert.deepEqual(syncedState, {
    dirty: false,
    updatedAt: 321,
    lastSyncedAt: 654,
  })
})
