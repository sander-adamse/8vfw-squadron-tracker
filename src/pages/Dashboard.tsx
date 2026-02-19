import React, { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import { api } from '@/lib/api'
import { StatCard } from '@/components/StatCard'
import { Pilot, QuickStats } from '@/types'
import { Users, TrendingUp, Target, Zap, Plane } from 'lucide-react'

// Deterministic colour from a string — cycles through a palette
const AVATAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-pink-500', 'bg-indigo-500',
]
function avatarColor(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export const Dashboard: React.FC = () => {
  const { user } = useAuthStore()
  const { quickStats, setQuickStats, setLoading } = useDataStore()
  const [pilots, setPilots] = useState<Pilot[]>([])
  const [qualifications, setQualifications] = useState<any[]>([])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pilotsData, statsData, qualsData] = await Promise.all([
          api.pilots.getAll(),
          api.qualifications.getStats(),
          api.qualifications.getAll(),
        ])

        setPilots(pilotsData || [])
        setQualifications(qualsData || [])

        const stats: QuickStats = {
          total_pilots: statsData.total_pilots,
          combat_ready_pilots: statsData.combat_ready_pilots,
          overall_readiness_percentage: statsData.overall_readiness_percentage,
          average_completion_percentage: statsData.average_completion_percentage,
        }

        setQuickStats(stats)
      } catch (error) {
        console.error('Error fetching dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [setQuickStats, setLoading])

  const fmqCount = qualifications.filter(q => q.status === 'FMQ' || q.status === 'IP').length
  const mqtCount = qualifications.filter(q => q.status === 'MQT').length
  const nmqCount = qualifications.filter(q => q.status === 'NMQ').length
  const qualTotal = qualifications.length

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Squadron</p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Dashboard</h1>
        </div>
        <p className="text-sm text-gray-400 dark:text-gray-500">{user?.email}</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Pilots"
          value={quickStats?.total_pilots || 0}
          icon={<Users className="w-4 h-4" />}
          accent="border-blue-500"
        />
        <StatCard
          title="Combat Ready"
          value={quickStats?.combat_ready_pilots || 0}
          icon={<Zap className="w-4 h-4" />}
          accent="border-emerald-500"
        />
        <StatCard
          title="Readiness"
          value={`${(quickStats?.overall_readiness_percentage || 0).toFixed(1)}%`}
          icon={<TrendingUp className="w-4 h-4" />}
          accent="border-amber-500"
        />
        <StatCard
          title="Avg. Completion"
          value={`${(quickStats?.average_completion_percentage || 0).toFixed(1)}%`}
          icon={<Target className="w-4 h-4" />}
          accent="border-purple-500"
        />
      </div>

      {/* Two-column layout: pilots table + qual breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Pilot table — takes 2/3 width */}
        <div className="lg:col-span-2">
          <h2 className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Pilots</h2>
          {pilots.length > 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Callsign</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider hidden sm:table-cell">Wing</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-emerald-600 dark:text-emerald-500 uppercase tracking-wider">FMQ</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-amber-600 dark:text-amber-500 uppercase tracking-wider">MQT</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-red-500 dark:text-red-400 uppercase tracking-wider">NMQ</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Done</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {pilots.slice(0, 10).map((pilot) => {
                    const pilotQuals = qualifications.filter(q => q.pilot_id === pilot.id)
                    const fmq = pilotQuals.filter(q => q.status === 'FMQ' || q.status === 'IP').length
                    const mqt = pilotQuals.filter(q => q.status === 'MQT').length
                    const nmq = pilotQuals.filter(q => q.status === 'NMQ').length
                    const total = pilotQuals.length
                    const pct = total > 0 ? (fmq / total) * 100 : 0

                    return (
                      <tr key={pilot.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 ${avatarColor(pilot.callsign)}`}>
                              {pilot.callsign.slice(0, 1).toUpperCase()}
                            </div>
                            <div>
                              <span className="font-medium text-gray-900 dark:text-white">{pilot.callsign}</span>
                              {pilot.board_number && (
                                <span className="text-xs text-gray-400 dark:text-gray-500 ml-1.5">| {pilot.board_number}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs hidden sm:table-cell">{pilot.wing_name}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{fmq}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">{mqt}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm font-medium text-red-500 dark:text-red-400">{nmq}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-20 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-emerald-500 h-1.5 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400 w-9 text-right">{pct.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {pilots.length > 10 && (
                <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
                  <p className="text-xs text-gray-400 dark:text-gray-500">Showing 10 of {pilots.length} pilots</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-10 text-center">
              <Plane className="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto mb-2" />
              <p className="text-sm text-gray-400 dark:text-gray-500">No pilot data available</p>
            </div>
          )}
        </div>

        {/* Qualification breakdown — takes 1/3 width */}
        <div>
          <h2 className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Qualification Breakdown</h2>
          {qualTotal > 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
              {[
                { label: 'FMQ / IP', count: fmqCount, color: 'bg-emerald-500', textColor: 'text-emerald-600 dark:text-emerald-400', trackColor: 'bg-emerald-100 dark:bg-emerald-900/30' },
                { label: 'MQT', count: mqtCount, color: 'bg-amber-400', textColor: 'text-amber-600 dark:text-amber-400', trackColor: 'bg-amber-100 dark:bg-amber-900/30' },
                { label: 'NMQ', count: nmqCount, color: 'bg-red-400', textColor: 'text-red-500 dark:text-red-400', trackColor: 'bg-red-100 dark:bg-red-900/30' },
              ].map((stat) => {
                const pct = qualTotal > 0 ? (stat.count / qualTotal) * 100 : 0
                return (
                  <div key={stat.label} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${stat.color}`} />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{stat.label}</span>
                      </div>
                      <span className={`text-sm font-semibold tabular-nums ${stat.textColor}`}>{stat.count}</span>
                    </div>
                    <div className={`w-full rounded-full h-1.5 overflow-hidden ${stat.trackColor}`}>
                      <div
                        className={`${stat.color} h-1.5 rounded-full transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-right tabular-nums">{pct.toFixed(1)}%</p>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-10 text-center">
              <Target className="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto mb-2" />
              <p className="text-sm text-gray-400 dark:text-gray-500">No data yet</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
