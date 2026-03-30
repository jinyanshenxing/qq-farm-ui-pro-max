import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'

export interface Land {
  id: number
  plantName?: string
  phaseName?: string
  seedImage?: string
  status: string
  matureInSec: number
  totalGrowTime?: number
  currentPhaseStartSec?: number
  currentPhaseEndSec?: number
  currentPhaseDurationSec?: number
  currentPhaseRemainingSec?: number
  currentPhaseElapsedSec?: number
  currentPhaseProgress?: number
  needWater?: boolean
  needWeed?: boolean
  needBug?: boolean
  [key: string]: any
}

export const useFarmStore = defineStore('farm', () => {
  const lands = ref<Land[]>([])
  const seeds = ref<any[]>([])
  const bagSeeds = ref<any[]>([])
  const summary = ref<any>({})
  const loading = ref(false)
  const operatingLandIds = ref<number[]>([])

  async function fetchLands(accountId: string) {
    if (!accountId)
      return
    loading.value = true
    try {
      const { data } = await api.get('/api/lands', {
        headers: { 'x-account-id': accountId },
      })
      if (data && data.ok) {
        lands.value = data.data.lands || []
        summary.value = data.data.summary || {}
      }
    }
    finally {
      loading.value = false
    }
  }

  async function fetchSeeds(accountId: string) {
    if (!accountId) {
      seeds.value = []
      return
    }
    seeds.value = []
    const { data } = await api.get('/api/seeds', {
      headers: { 'x-account-id': accountId },
    })
    if (data && data.ok)
      seeds.value = data.data || []
  }

  async function fetchPlantableBagSeeds(accountId: string, options: { includeZeroUsable?: boolean, includeLocked?: boolean } = {}) {
    if (!accountId) {
      bagSeeds.value = []
      return
    }
    bagSeeds.value = []
    const { data } = await api.get('/api/bag/plantable-seeds', {
      headers: { 'x-account-id': accountId },
      params: {
        includeZeroUsable: options.includeZeroUsable !== false ? 1 : 0,
        includeLocked: options.includeLocked === true ? 1 : 0,
      },
    })
    if (data && data.ok)
      bagSeeds.value = data.data || []
  }

  async function operate(accountId: string, opType: string) {
    if (!accountId)
      return
    await api.post('/api/farm/operate', { opType }, {
      headers: { 'x-account-id': accountId },
    })
    await fetchLands(accountId)
  }

  async function operateLand(accountId: string, landId: number, opType: string, options: { refresh?: boolean } = {}) {
    if (!accountId || !landId)
      return
    operatingLandIds.value = [...new Set([...operatingLandIds.value, landId])]
    try {
      await api.post('/api/farm/land/operate', { opType, landId }, {
        headers: { 'x-account-id': accountId },
      })
      if (options.refresh !== false)
        await fetchLands(accountId)
    }
    finally {
      operatingLandIds.value = operatingLandIds.value.filter(id => id !== landId)
    }
  }

  async function operateLands(accountId: string, landIds: number[], opType: string) {
    const normalizedIds = Array.from(new Set((landIds || []).map(id => Number(id || 0)).filter(id => id > 0)))
    if (!accountId || normalizedIds.length === 0)
      return
    for (const landId of normalizedIds)
      await operateLand(accountId, landId, opType, { refresh: false })
    await fetchLands(accountId)
  }

  return { lands, summary, seeds, bagSeeds, loading, operatingLandIds, fetchLands, fetchSeeds, fetchPlantableBagSeeds, operate, operateLand, operateLands }
})
