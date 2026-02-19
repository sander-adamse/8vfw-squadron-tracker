import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/lib/api'
import { Pilot, Qualification, Skill } from '@/types'

const statusStyle: Record<string, { badge: string; bar: string; label: string }> = {
  FMQ: { badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500', label: 'FMQ' },
  IP:  { badge: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',   bar: 'bg-purple-500',  label: 'IP'  },
  MQT: { badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',       bar: 'bg-amber-400',   label: 'MQT' },
  NMQ: { badge: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',               bar: 'bg-red-400',     label: 'NMQ' },
}
const defaultStyle = { badge: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400', bar: 'bg-gray-300', label: 'NMQ' }

export const PilotProfile: React.FC = () => {
  const [searchParams] = useSearchParams()
  const searchQuery = searchParams.get('search')
  const { user } = useAuthStore()

  const [pilot, setPilot] = useState<Pilot | null>(null)
  const [qualifications, setQualifications] = useState<Qualification[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchPilotData = async () => {
      try {
        setLoading(true)
        setError(null)
        const query = searchQuery || user?.email || ''
        if (!query) { setLoading(false); return }

        const foundPilot = await api.pilots.search(query)
        setPilot(foundPilot)

        const [qualsData, skillsData] = await Promise.all([
          api.qualifications.getByPilot(foundPilot.id),
          api.skills.getAll(foundPilot.wing_id),
        ])

        setQualifications(qualsData)
        setSkills(skillsData)
      } catch (err: any) {
        setError(err.message || 'Pilot not found')
        setPilot(null)
      } finally {
        setLoading(false)
      }
    }

    if (searchQuery) fetchPilotData()
    else setLoading(false)
  }, [searchQuery])

  if (loading) return <div className="text-center py-12 text-sm text-gray-400">Loading profile...</div>

  if (!pilot || error) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-900 dark:text-white font-medium">{error || 'No pilot selected'}</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Use the search bar to find a pilot</p>
      </div>
    )
  }

  const fmqCount  = qualifications.filter(q => q.status === 'FMQ' || q.status === 'IP').length
  const mqtCount  = qualifications.filter(q => q.status === 'MQT').length
  const nmqCount  = qualifications.filter(q => q.status === 'NMQ').length
  const total     = qualifications.length
  const readiness = total > 0 ? (fmqCount / total) * 100 : 0

  const skillsByCategory = skills.reduce((acc, skill) => {
    if (!acc[skill.category]) acc[skill.category] = []
    acc[skill.category].push(skill)
    return acc
  }, {} as Record<string, Skill[]>)

  return (
    <div className="space-y-6 pb-12">

      {/* Hero card */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        {/* Banner */}
        <div className="px-6 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center gap-2">
          <div className="w-1 h-4 rounded-full bg-gray-400 dark:bg-gray-500" />
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest">8th Virtual Fighter Wing</p>
        </div>

        <div className="p-6">
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div className="h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-200 text-2xl font-bold shrink-0">
              {pilot.callsign.slice(0, 1).toUpperCase()}
            </div>

            {/* Name + meta */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{pilot.callsign}</h1>
                {pilot.board_number && (
                  <span className="text-sm text-gray-400 dark:text-gray-500">| {pilot.board_number}</span>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {pilot.first_name} {pilot.last_name}
              </p>

              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4">
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">Role</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5 capitalize">{pilot.role}</p>
                </div>
              </div>
            </div>

            {/* Readiness */}
            <div className="text-right shrink-0">
              <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Readiness</p>
              <p className="text-3xl font-semibold text-gray-900 dark:text-white tabular-nums">{readiness.toFixed(0)}%</p>
              <div className="w-24 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 mt-2 ml-auto overflow-hidden">
                <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${readiness}%` }} />
              </div>
            </div>
          </div>

          {/* Qual stat row */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-gray-100 dark:border-gray-800">
            {[
              { label: 'FMQ / IP', value: fmqCount, color: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'MQT',      value: mqtCount, color: 'text-amber-600 dark:text-amber-400' },
              { label: 'NMQ',      value: nmqCount, color: 'text-red-500 dark:text-red-400' },
            ].map(stat => (
              <div key={stat.label} className="text-center">
                <p className={`text-2xl font-semibold tabular-nums ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Skills by category */}
      <div className="space-y-4">
        {Object.entries(skillsByCategory).map(([category, categorySkills]) => {
          const catFmq = categorySkills.filter(s => {
            const q = qualifications.find(q => q.skill_id === s.id)
            return q?.status === 'FMQ' || q?.status === 'IP'
          }).length
          const catPct = categorySkills.length > 0 ? (catFmq / categorySkills.length) * 100 : 0

          return (
            <div key={category} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
              {/* Category header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40">
                <h2 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-widest">{category}</h2>
                <div className="flex items-center gap-3">
                  <div className="w-20 bg-gray-200 dark:bg-gray-700 rounded-full h-1 overflow-hidden">
                    <div className="bg-emerald-500 h-1 rounded-full" style={{ width: `${catPct}%` }} />
                  </div>
                  <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500">{catPct.toFixed(0)}%</span>
                </div>
              </div>

              {/* Skill rows */}
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {categorySkills.map(skill => {
                  const qualification = qualifications.find(q => q.skill_id === skill.id)
                  const status = qualification?.status ?? 'NMQ'
                  const style = statusStyle[status] ?? defaultStyle

                  return (
                    <div key={skill.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{skill.name}</p>
                        {skill.description && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{skill.description}</p>
                        )}
                      </div>
                      <span className={`px-2.5 py-1 rounded text-xs font-semibold ${style.badge}`}>
                        {status}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
