import { create } from 'zustand'
import { Pilot, Skill, Qualification, QuickStats, Wing } from '@/types'

interface DataState {
  pilots: Pilot[]
  skills: Skill[]
  qualifications: Qualification[]
  wings: Wing[]
  quickStats: QuickStats | null
  loading: boolean
  settings: Record<string, string>
  setPilots: (pilots: Pilot[]) => void
  setSkills: (skills: Skill[]) => void
  setQualifications: (qualifications: Qualification[]) => void
  setWings: (wings: Wing[]) => void
  setQuickStats: (stats: QuickStats) => void
  setLoading: (loading: boolean) => void
  setSettings: (settings: Record<string, string>) => void
  updateQualification: (id: string, status: string) => void
}

export const useDataStore = create<DataState>((set) => ({
  pilots: [],
  skills: [],
  qualifications: [],
  wings: [],
  quickStats: null,
  loading: true,
  settings: {},
  setPilots: (pilots) => set({ pilots }),
  setSkills: (skills) => set({ skills }),
  setQualifications: (qualifications) => set({ qualifications }),
  setWings: (wings) => set({ wings }),
  setQuickStats: (quickStats) => set({ quickStats }),
  setLoading: (loading) => set({ loading }),
  setSettings: (settings) => set({ settings }),
  updateQualification: (id, status) => set((state) => ({
    qualifications: state.qualifications.map((q) =>
      q.id === id ? { ...q, status: status as any } : q
    )
  })),
}))
