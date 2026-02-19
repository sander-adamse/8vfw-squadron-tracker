import React, { useEffect, useState, useRef, useMemo } from 'react'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/lib/api'
import { Pilot, Skill, Wing, Qualification, QualificationStatus } from '@/types'
import { Upload, Download, FileText, Users, Wrench, ChevronDown, ChevronUp, Plus, Trash2, Pencil, Check, X, Save, GripVertical } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export const InstructorTools: React.FC = () => {
  const { user } = useAuthStore()

  if (user?.role !== 'instructor' && user?.role !== 'admin') {
    return (
      <div className="text-center py-12">
        <p className="text-lg font-semibold text-gray-900 dark:text-white">Access Denied</p>
        <p className="text-gray-600 dark:text-gray-400">
          Only instructors can access this page
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Instructor Tools</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Manage pilot qualifications and training</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ImportCsvSection />
        <ExportSection />
        <ReportSection />
        <ManagePilotsSection />
      </div>

      <ManageSkillsSection />

      <ManageCategoriesSection />
    </div>
  )
}

// ── Import CSV ──────────────────────────────────────────────

const ImportCsvSection: React.FC = () => {
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const parseCsv = (text: string): Array<{ callsign: string; skill_name: string; status: string }> => {
    const lines = text.trim().split('\n')
    if (lines.length < 2) return []

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase())
    const callsignIdx = headers.findIndex(h => h === 'callsign')
    const skillIdx = headers.findIndex(h => h === 'skill' || h === 'skill_name' || h === 'skill name')
    const statusIdx = headers.findIndex(h => h === 'status')

    if (callsignIdx === -1 || skillIdx === -1 || statusIdx === -1) {
      throw new Error('CSV must have Callsign, Skill (or Skill_Name), and Status columns')
    }

    return lines.slice(1).filter(l => l.trim()).map(line => {
      // Simple CSV parse handling quoted fields
      const fields: string[] = []
      let current = ''
      let inQuote = false
      for (const char of line) {
        if (char === '"') { inQuote = !inQuote; continue }
        if (char === ',' && !inQuote) { fields.push(current.trim()); current = ''; continue }
        current += char
      }
      fields.push(current.trim())

      return {
        callsign: fields[callsignIdx] || '',
        skill_name: fields[skillIdx] || '',
        status: fields[statusIdx] || '',
      }
    })
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setResult(null)
    setError(null)

    try {
      const text = await file.text()
      const records = parseCsv(text)
      if (records.length === 0) {
        setError('No valid records found in CSV')
        return
      }
      const res = await api.qualifications.bulkImport(records)
      setResult(res)
    } catch (err: any) {
      setError(err.message || 'Import failed')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 border border-gray-200 dark:border-gray-800">
      <div className="flex items-center gap-3 mb-4">
        <Upload className="w-5 h-5 text-blue-600" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Import CSV</h2>
      </div>
      <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
        Upload a CSV with columns: <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">Callsign, Skill, Status</code>
      </p>

      <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={importing}
        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition disabled:opacity-50"
      >
        {importing ? 'Importing...' : 'Choose CSV File'}
      </button>

      {result && (
        <div className="mt-4 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded text-sm">
          <p className="text-green-700 dark:text-green-300 font-medium">
            Imported {result.imported} record{result.imported !== 1 ? 's' : ''}, skipped {result.skipped}
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 text-red-600 dark:text-red-400 text-xs space-y-0.5">
              {result.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
    </div>
  )
}

// ── Export ──────────────────────────────────────────────────

const ExportSection: React.FC = () => {
  const [wings, setWings] = useState<Wing[]>([])
  const [selectedWingId, setSelectedWingId] = useState<string>('')
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.wings.getAll().then(setWings).catch(console.error)
  }, [])

  const handleExport = async () => {
    setExporting(true)
    setError(null)
    try {
      const csv = await api.qualifications.exportCsv(selectedWingId || undefined)
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `qualifications_export_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setError(err.message || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 border border-gray-200 dark:border-gray-800">
      <div className="flex items-center gap-3 mb-4">
        <Download className="w-5 h-5 text-emerald-600" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Export Data</h2>
      </div>
      <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
        Download all qualifications as a CSV file
      </p>

      <div className="flex items-center gap-3">
        <select
          value={selectedWingId}
          onChange={(e) => setSelectedWingId(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
        >
          <option value="">All Wings</option>
          {wings.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded transition disabled:opacity-50"
        >
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
    </div>
  )
}

// ── Generate Report ─────────────────────────────────────────

const ReportSection: React.FC = () => {
  const [wings, setWings] = useState<Wing[]>([])
  const [selectedWingId, setSelectedWingId] = useState<string>('')
  const [report, setReport] = useState<any>(null)
  const [pilotBreakdown, setPilotBreakdown] = useState<any[]>([])
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    api.wings.getAll().then(setWings).catch(console.error)
  }, [])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const [stats, pilots, skills, quals] = await Promise.all([
        api.qualifications.getStats(selectedWingId || undefined),
        api.pilots.getAll(),
        api.skills.getAll(selectedWingId || undefined),
        api.qualifications.getAll(),
      ])

      setReport(stats)

      // Build per-pilot breakdown
      const filteredPilots = selectedWingId
        ? pilots.filter((p: Pilot) => p.wing_id === selectedWingId)
        : pilots

      const breakdown = filteredPilots.map((pilot: Pilot) => {
        const pilotQuals = quals.filter((q: Qualification) => q.pilot_id === pilot.id)
        const fmq = pilotQuals.filter((q: Qualification) => q.status === 'FMQ' || q.status === 'IP').length
        const mqt = pilotQuals.filter((q: Qualification) => q.status === 'MQT').length
        const nmq = pilotQuals.filter((q: Qualification) => q.status === 'NMQ').length
        const total = pilotQuals.length

        return {
          callsign: pilot.callsign,
          wing_name: pilot.wing_name,
          total,
          fmq,
          mqt,
          nmq,
          completion: total > 0 ? ((fmq / total) * 100).toFixed(1) : '0.0',
        }
      })

      setPilotBreakdown(breakdown.sort((a: any, b: any) => parseFloat(b.completion) - parseFloat(a.completion)))
    } catch (err) {
      console.error('Report generation failed:', err)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 border border-gray-200 dark:border-gray-800 lg:col-span-2">
      <div className="flex items-center gap-3 mb-4">
        <FileText className="w-5 h-5 text-amber-600" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Readiness Report</h2>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <select
          value={selectedWingId}
          onChange={(e) => setSelectedWingId(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
        >
          <option value="">All Wings</option>
          {wings.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded transition disabled:opacity-50"
        >
          {generating ? 'Generating...' : 'Generate Report'}
        </button>
      </div>

      {report && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Pilots</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{report.total_pilots}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Combat Ready</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{report.combat_ready_pilots}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Readiness %</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{report.overall_readiness_percentage.toFixed(1)}%</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Avg Completion</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{report.average_completion_percentage.toFixed(1)}%</p>
            </div>
          </div>

          {pilotBreakdown.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left p-2 font-semibold text-gray-900 dark:text-white">Pilot</th>
                    <th className="text-left p-2 font-semibold text-gray-900 dark:text-white">Wing</th>
                    <th className="text-center p-2 font-semibold text-gray-900 dark:text-white">Total</th>
                    <th className="text-center p-2 font-semibold text-gray-900 dark:text-white">FMQ/IP</th>
                    <th className="text-center p-2 font-semibold text-gray-900 dark:text-white">MQT</th>
                    <th className="text-center p-2 font-semibold text-gray-900 dark:text-white">NMQ</th>
                    <th className="text-center p-2 font-semibold text-gray-900 dark:text-white">Completion</th>
                  </tr>
                </thead>
                <tbody>
                  {pilotBreakdown.map((p: any) => (
                    <tr key={p.callsign} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="p-2 font-medium text-gray-900 dark:text-white">{p.callsign}</td>
                      <td className="p-2 text-gray-600 dark:text-gray-400">{p.wing_name}</td>
                      <td className="p-2 text-center font-medium text-gray-900 dark:text-white">{p.total}</td>
                      <td className="p-2 text-center text-emerald-600 dark:text-emerald-400 font-medium">{p.fmq}</td>
                      <td className="p-2 text-center text-amber-600 dark:text-amber-400 font-medium">{p.mqt}</td>
                      <td className="p-2 text-center text-red-600 dark:text-red-400 font-medium">{p.nmq}</td>
                      <td className="p-2 text-center">
                        <div className="flex items-center gap-2 justify-center">
                          <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className="bg-emerald-500 h-2 rounded-full"
                              style={{ width: `${p.completion}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{p.completion}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Manage Pilots ───────────────────────────────────────────

const ManagePilotsSection: React.FC = () => {
  const { user } = useAuthStore()
  const [pilots, setPilots] = useState<Pilot[]>([])
  const [wings, setWings] = useState<Wing[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [form, setForm] = useState({ callsign: '', first_name: '', last_name: '', email: '', wing_id: '', board_number: '' })

  useEffect(() => {
    Promise.all([api.pilots.getAll(), api.wings.getAll()])
      .then(([p, w]) => { setPilots(p); setWings(w) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  const resetForm = () => {
    setForm({ callsign: '', first_name: '', last_name: '', email: '', wing_id: '', board_number: '' })
    setShowAddForm(false)
  }

  const handleAddPilot = async () => {
    if (!form.callsign.trim() || !form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
      setError('Callsign, first name, last name, and email are required')
      return
    }

    const isAdmin = user?.role === 'admin'
    if (isAdmin && !form.wing_id) {
      setError('Wing is required')
      return
    }

    setAdding(true)
    setError(null)
    try {
      const pilot = await api.pilots.create({
        callsign: form.callsign.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        wing_id: isAdmin ? form.wing_id : undefined,
        board_number: form.board_number.trim() || undefined,
      })
      setPilots([...pilots, pilot])
      resetForm()
      showSuccess(`Pilot "${pilot.callsign}" created — temporary password: ${pilot.temp_password}`)
    } catch (err: any) {
      setError(err.message || 'Failed to create pilot')
    } finally {
      setAdding(false)
    }
  }

  // Instructor sees only their wing's pilots
  const userWing = wings.find(w => w.id === user?.wing_id)
  const filteredPilots = user?.role === 'admin'
    ? pilots
    : pilots.filter(p => p.wing_id === user?.wing_id)

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 border border-gray-200 dark:border-gray-800 lg:col-span-2">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3"
        >
          <Users className="w-5 h-5 text-purple-600" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Pilot Overview</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">({filteredPilots.length} pilots)</span>
          {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setShowAddForm(!showAddForm); setExpanded(true) }}
          className="flex items-center gap-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded transition"
        >
          <Plus className="w-4 h-4" />
          Add Pilot
        </button>
      </div>

      {expanded && (
        <div className="mt-4">
          {error && (
            <div className="mb-3 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded text-sm">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="mb-3 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 rounded text-sm">
              {successMsg}
            </div>
          )}

          {showAddForm && (
            <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                New Pilot {userWing ? `for ${userWing.name}` : ''}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Callsign *</label>
                  <input
                    value={form.callsign}
                    onChange={(e) => setForm({ ...form, callsign: e.target.value })}
                    placeholder="e.g. VIPER"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Board #</label>
                  <input
                    value={form.board_number}
                    onChange={(e) => setForm({ ...form, board_number: e.target.value })}
                    placeholder="e.g. 118"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">First Name *</label>
                  <input
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    placeholder="John"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Last Name *</label>
                  <input
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    placeholder="Smith"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email *</label>
                  <input
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="john@example.com"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                  />
                </div>
                {user?.role === 'admin' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Wing *</label>
                    <select
                      value={form.wing_id}
                      onChange={(e) => setForm({ ...form, wing_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="">Select wing...</option>
                      {wings.map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <button
                    onClick={handleAddPilot}
                    disabled={adding}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded transition disabled:opacity-50"
                  >
                    {adding ? 'Creating...' : 'Create Pilot'}
                  </button>
                  <button
                    onClick={resetForm}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                A temporary password will be shown after creation.
              </p>
            </div>
          )}

          <div className="overflow-x-auto">
            {loading ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">Loading pilots...</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left p-2 font-semibold text-gray-900 dark:text-white">Callsign</th>
                    <th className="text-left p-2 font-semibold text-gray-900 dark:text-white">Board #</th>
                    <th className="text-left p-2 font-semibold text-gray-900 dark:text-white">Name</th>
                    <th className="text-left p-2 font-semibold text-gray-900 dark:text-white">Wing</th>
                    <th className="text-left p-2 font-semibold text-gray-900 dark:text-white">Role</th>
                    <th className="text-left p-2 font-semibold text-gray-900 dark:text-white">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPilots.map(pilot => (
                    <tr key={pilot.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="p-2 font-medium text-gray-900 dark:text-white">
                        {pilot.callsign}{pilot.board_number && <span className="text-gray-400 dark:text-gray-500 font-normal"> | {pilot.board_number}</span>}
                      </td>
                      <td className="p-2 text-gray-500 dark:text-gray-400 font-mono text-xs">{pilot.board_number || '—'}</td>
                      <td className="p-2 text-gray-700 dark:text-gray-300">{pilot.first_name} {pilot.last_name}</td>
                      <td className="p-2 text-gray-700 dark:text-gray-300">{pilot.wing_name}</td>
                      <td className="p-2 text-gray-700 dark:text-gray-300 capitalize">{pilot.role}</td>
                      <td className="p-2 text-gray-500 dark:text-gray-400">{pilot.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Manage Skills (Admin only) ──────────────────────────────

// Sortable skill row component
const SortableSkillRow: React.FC<{
  skill: Skill
  editingId: string | null
  editName: string
  editCategory: string
  setEditName: (v: string) => void
  setEditCategory: (v: string) => void
  onStartEdit: (skill: Skill) => void
  onSaveEdit: (id: string) => void
  onCancelEdit: () => void
  onDelete: (id: string) => void
}> = ({ skill, editingId, editName, editCategory, setEditName, setEditCategory, onStartEdit, onSaveEdit, onCancelEdit, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: skill.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition group ${isDragging ? 'shadow-lg ring-2 ring-orange-400' : ''}`}
    >
      {editingId === skill.id ? (
        <div className="flex items-center gap-2 flex-1 ml-6">
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
          />
          <input
            value={editCategory}
            onChange={(e) => setEditCategory(e.target.value)}
            list="categories-list"
            className="w-48 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
          />
          <button
            onClick={() => onSaveEdit(skill.id)}
            className="p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900 rounded"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={onCancelEdit}
            className="p-1 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <button
              {...attributes}
              {...listeners}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-grab active:cursor-grabbing touch-none"
              title="Drag to reorder"
            >
              <GripVertical className="w-4 h-4" />
            </button>
            <span className="text-sm text-gray-900 dark:text-white">{skill.name}</span>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
            <button
              onClick={() => onStartEdit(skill)}
              className="p-1 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(skill.id)}
              className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900 rounded"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const ManageSkillsSection: React.FC = () => {
  const { user } = useAuthStore()
  const [wings, setWings] = useState<Wing[]>([])
  const [selectedWingId, setSelectedWingId] = useState<string>('')
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Add skill form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newSkillName, setNewSkillName] = useState('')
  const [newSkillCategory, setNewSkillCategory] = useState('')
  const [adding, setAdding] = useState(false)

  // Edit skill
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState('')

  // Drag active state
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Save selected wing to localStorage whenever it changes
  useEffect(() => {
    if (selectedWingId) {
      localStorage.setItem('instructor_tools_selected_wing', selectedWingId)
    }
  }, [selectedWingId])

  useEffect(() => {
    api.wings.getAll().then(w => {
      setWings(w)
      // For instructors, auto-select their wing; for admins, try to restore from localStorage
      let defaultWingId = ''
      if (user?.role === 'instructor') {
        defaultWingId = user?.wing_id || ''
      } else {
        // For admins, try to restore from localStorage first
        const savedWingId = localStorage.getItem('instructor_tools_selected_wing')
        if (savedWingId && w.some(wing => wing.id === savedWingId)) {
          defaultWingId = savedWingId
        } else if (w.length > 0) {
          defaultWingId = w[0].id
        }
      }
      if (defaultWingId && !selectedWingId) {
        setSelectedWingId(defaultWingId)
      }
    }).catch(console.error)
  }, [user?.wing_id, user?.role])

  useEffect(() => {
    if (!selectedWingId) return
    setLoading(true)
    api.skills.getAll(selectedWingId)
      .then(setSkills)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedWingId])

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  const handleAddSkill = async () => {
    if (!newSkillName.trim() || !newSkillCategory.trim()) {
      setError('Skill name and category are required')
      return
    }
    setAdding(true)
    setError(null)
    try {
      const skill = await api.wings.addSkill(selectedWingId, newSkillName.trim(), newSkillCategory.trim())
      setSkills([...skills, skill])
      setNewSkillName('')
      setNewSkillCategory('')
      setShowAddForm(false)
      showSuccess('Skill added')
    } catch (err: any) {
      setError(err.message || 'Failed to add skill')
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteSkill = async (skillId: string) => {
    setError(null)
    try {
      await api.wings.deleteSkill(selectedWingId, skillId)
      setSkills(skills.filter(s => s.id !== skillId))
      showSuccess('Skill deleted')
    } catch (err: any) {
      setError(err.message || 'Failed to delete skill')
    }
  }

  const startEdit = (skill: Skill) => {
    setEditingId(skill.id)
    setEditName(skill.name)
    setEditCategory(skill.category)
  }

  const handleSaveEdit = async (skillId: string) => {
    setError(null)
    try {
      const updated = await api.wings.updateSkill(selectedWingId, skillId, {
        name: editName.trim(),
        category: editCategory.trim(),
      })
      setSkills(skills.map(s => s.id === skillId ? updated : s))
      setEditingId(null)
      showSuccess('Skill updated')
    } catch (err: any) {
      setError(err.message || 'Failed to update skill')
    }
  }

  // Get unique categories for the current wing's skills (for the dropdown suggestion)
  const categories = [...new Set(skills.map(s => s.category))]

  // Group skills by category for display, maintaining sort_order
  const skillsByCategory = useMemo(() => {
    const grouped = skills.reduce((acc, skill) => {
      if (!acc[skill.category]) acc[skill.category] = []
      acc[skill.category].push(skill)
      return acc
    }, {} as Record<string, Skill[]>)
    // Sort within each category by sort_order
    for (const cat of Object.keys(grouped)) {
      grouped[cat].sort((a, b) => a.sort_order - b.sort_order)
    }
    return grouped
  }, [skills])

  const activeSkill = activeId ? skills.find(s => s.id === activeId) : null

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    // Find which category the dragged skill belongs to
    const activeSkill = skills.find(s => s.id === active.id)
    const overSkill = skills.find(s => s.id === over.id)
    if (!activeSkill || !overSkill) return

    // Only allow reordering within the same category
    if (activeSkill.category !== overSkill.category) return

    const category = activeSkill.category
    const catSkills = [...skillsByCategory[category]]
    const oldIndex = catSkills.findIndex(s => s.id === active.id)
    const newIndex = catSkills.findIndex(s => s.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(catSkills, oldIndex, newIndex)

    // Build the full new skill order: iterate categories in order, replacing the affected one
    const newSkills: Skill[] = []
    let sortCounter = 1
    for (const cat of Object.keys(skillsByCategory)) {
      const items = cat === category ? reordered : skillsByCategory[cat]
      for (const s of items) {
        newSkills.push({ ...s, sort_order: sortCounter })
        sortCounter++
      }
    }

    // Optimistically update UI
    setSkills(newSkills)

    // Persist to backend
    setSaving(true)
    setError(null)
    try {
      const orderedIds = newSkills.map(s => s.id)
      await api.wings.reorderSkills(selectedWingId, orderedIds)
      showSuccess('Order saved')
    } catch (err: any) {
      setError(err.message || 'Failed to save order')
      // Revert on error
      api.skills.getAll(selectedWingId).then(setSkills).catch(console.error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 border border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3"
        >
          <Wrench className="w-5 h-5 text-orange-600" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Manage Skills</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">({skills.length} skills)</span>
          {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          {saving && (
            <span className="text-xs text-orange-500 animate-pulse">Saving order...</span>
          )}
        </button>
        <div className="flex items-center gap-3">
          {user?.role === 'admin' ? (
            <select
              value={selectedWingId}
              onChange={(e) => setSelectedWingId(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              {wings.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          ) : (
            <div className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm">
              {wings.find(w => w.id === selectedWingId)?.name || 'Loading...'}
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setShowAddForm(!showAddForm); setExpanded(true) }}
            className="flex items-center gap-1 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded transition"
          >
            <Plus className="w-4 h-4" />
            Add Skill
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded text-sm">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 rounded text-sm">
              {successMsg}
            </div>
          )}

          {showAddForm && (
            <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Skill Name</label>
                  <input
                    value={newSkillName}
                    onChange={(e) => setNewSkillName(e.target.value)}
                    placeholder="e.g. CASE I Recovery"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Category</label>
                  <input
                    value={newSkillCategory}
                    onChange={(e) => setNewSkillCategory(e.target.value)}
                    placeholder="e.g. ADVANCED FLYING"
                    list="categories-list"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                  />
                  <datalist id="categories-list">
                    {categories.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <button
                  onClick={handleAddSkill}
                  disabled={adding}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded transition disabled:opacity-50"
                >
                  {adding ? 'Adding...' : 'Add'}
                </button>
                <button
                  onClick={() => { setShowAddForm(false); setNewSkillName(''); setNewSkillCategory('') }}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">Loading skills...</p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="space-y-4">
                {Object.entries(skillsByCategory).map(([category, catSkills]) => (
                  <div key={category}>
                    <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      {category} ({catSkills.length})
                    </h3>
                    <SortableContext
                      items={catSkills.map(s => s.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-1">
                        {catSkills.map(skill => (
                          <SortableSkillRow
                            key={skill.id}
                            skill={skill}
                            editingId={editingId}
                            editName={editName}
                            editCategory={editCategory}
                            setEditName={setEditName}
                            setEditCategory={setEditCategory}
                            onStartEdit={startEdit}
                            onSaveEdit={handleSaveEdit}
                            onCancelEdit={() => setEditingId(null)}
                            onDelete={handleDeleteSkill}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </div>
                ))}

                {skills.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No skills for this wing yet.</p>
                )}
              </div>

              <DragOverlay>
                {activeSkill ? (
                  <div className="flex items-center gap-2 p-2 bg-white dark:bg-gray-700 rounded shadow-xl ring-2 ring-orange-400 text-sm text-gray-900 dark:text-white">
                    <GripVertical className="w-4 h-4 text-orange-500" />
                    {activeSkill.name}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}

          <div className="mt-4 text-xs text-gray-400 dark:text-gray-600">
            {skills.length} skill{skills.length !== 1 ? 's' : ''} total
            {skills.length > 0 && ' — drag skills to reorder within a category'}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sortable Category Row ──────────────────────────────────────────────

const SortableCategoryRow: React.FC<{
  category: { name: string; color: string; sort_order: number }
  editingCategoryName: string | null
  editColor: string
  setEditColor: (v: string) => void
  setEditingCategoryName: (v: string | null) => void
  onColorChange: (categoryName: string, newColor: string) => void
  onDelete: (categoryName: string) => void
}> = ({ category, editingCategoryName, editColor, setEditColor, setEditingCategoryName, onColorChange, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.name })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 group ${isDragging ? 'shadow-lg ring-2 ring-blue-400' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-grab active:cursor-grabbing touch-none"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <div
        className="w-8 h-8 rounded border-2 border-gray-300 dark:border-gray-600 cursor-pointer hover:opacity-80"
        style={{ backgroundColor: category.color }}
        onClick={() => {
          setEditingCategoryName(category.name)
          setEditColor(category.color)
        }}
        title="Click to change color"
      />
      
      {editingCategoryName === category.name ? (
        <div className="flex items-center gap-2 flex-1">
          <input
            type="color"
            value={editColor}
            onChange={(e) => setEditColor(e.target.value)}
            className="w-12 h-10 cursor-pointer rounded"
          />
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-fit">
            {category.name}
          </div>
          <button
            onClick={() => {
              onColorChange(category.name, editColor)
              setEditingCategoryName(null)
            }}
            className="ml-auto p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900 rounded"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={() => setEditingCategoryName(null)}
            className="p-1 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-1">
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            {category.name}
          </div>
          <div className="flex items-center gap-1 ml-auto opacity-0 group-hover:opacity-100 transition">
            <button
              onClick={() => {
                setEditingCategoryName(category.name)
                setEditColor(category.color)
              }}
              className="p-1 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              title="Edit category color"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(category.name)}
              className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900 rounded"
              title="Delete category"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Manage Categories ──────────────────────────────────────────────

const ManageCategoriesSection: React.FC = () => {
  const { user } = useAuthStore()
  const [wings, setWings] = useState<Wing[]>([])
  const [selectedWingId, setSelectedWingId] = useState<string>('')
  const [categories, setCategories] = useState<Array<{ name: string; color: string; sort_order: number }>>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Create category form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#3B82F6')
  const [adding, setAdding] = useState(false)

  // Edit state
  const [editingCategoryName, setEditingCategoryName] = useState<string | null>(null)
  const [editColor, setEditColor] = useState('')

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Save selected wing to localStorage whenever it changes
  useEffect(() => {
    if (selectedWingId) {
      localStorage.setItem('instructor_tools_selected_wing', selectedWingId)
    }
  }, [selectedWingId])

  useEffect(() => {
    api.wings.getAll().then(w => {
      setWings(w)
      // For instructors, auto-select their wing; for admins, try to restore from localStorage
      let defaultWingId = ''
      if (user?.role === 'instructor') {
        defaultWingId = user?.wing_id || ''
      } else {
        // For admins, try to restore from localStorage first
        const savedWingId = localStorage.getItem('instructor_tools_selected_wing')
        if (savedWingId && w.some(wing => wing.id === savedWingId)) {
          defaultWingId = savedWingId
        } else if (w.length > 0) {
          defaultWingId = w[0].id
        }
      }
      if (defaultWingId && !selectedWingId) {
        setSelectedWingId(defaultWingId)
      }
    }).catch(console.error)
  }, [user?.wing_id, user?.role])

  useEffect(() => {
    if (!selectedWingId) return
    setLoading(true)
    setError(null)
    const fetchCategories = async () => {
      try {
        const categoriesData = await api.wings.getCategories(selectedWingId)
        // Map from API response format to component format
        const mapped = (categoriesData || []).map(c => ({
          name: c.category,
          color: c.color,
          sort_order: c.sort_order
        }))
        setCategories(mapped)
      } catch (err) {
        console.error('Error fetching categories:', err)
        setCategories([])
        // Don't show error - categories will be empty if wing has no skills yet
      } finally {
        setLoading(false)
      }
    }
    fetchCategories()
  }, [selectedWingId])

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      setError('Category name is required')
      return
    }
    setAdding(true)
    setError(null)
    try {
      const result = await api.wings.createCategory(selectedWingId, newCategoryName.trim(), newCategoryColor)
      setCategories([...categories, { name: result.category, color: result.color, sort_order: result.sort_order }])
      setNewCategoryName('')
      setNewCategoryColor('#3B82F6')
      setShowAddForm(false)
      showSuccess('Category created')
    } catch (err: any) {
      setError(err.message || 'Failed to create category')
    } finally {
      setAdding(false)
    }
  }

  const handleColorChange = async (categoryName: string, newColor: string) => {
    try {
      await api.wings.setCategoryColor(selectedWingId, categoryName, newColor)
      setCategories(categories.map(c =>
        c.name === categoryName ? { ...c, color: newColor } : c
      ))
      showSuccess(`Category color updated`)
    } catch (err: any) {
      setError(err.message || 'Failed to update category color')
    }
  }

  const handleDeleteCategory = async (categoryName: string) => {
    setError(null)
    try {
      await api.wings.deleteCategory(selectedWingId, categoryName)
      setCategories(categories.filter(c => c.name !== categoryName))
      showSuccess(`Category reset to default`)
    } catch (err: any) {
      setError(err.message || 'Failed to delete category')
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = categories.findIndex(c => c.name === active.id)
    const newIndex = categories.findIndex(c => c.name === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(categories, oldIndex, newIndex)
    setCategories(reordered)

    // Persist to backend
    setSaving(true)
    setError(null)
    try {
      const categoryOrder = reordered.map(c => c.name)
      await api.wings.reorderCategories(selectedWingId, categoryOrder)
      showSuccess('Category order saved')
    } catch (err: any) {
      setError(err.message || 'Failed to save category order')
      // Revert on error
      api.wings.getCategories(selectedWingId).then(setCategories).catch(console.error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 border border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3"
        >
          <Wrench className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Manage Categories</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">({categories.length} categories)</span>
          {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>
        <div className="flex items-center gap-3">
          {user?.role === 'admin' ? (
            <select
              value={selectedWingId}
              onChange={(e) => setSelectedWingId(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              {wings.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          ) : (
            <div className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm">
              {wings.find(w => w.id === selectedWingId)?.name || 'Loading...'}
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setShowAddForm(!showAddForm); setExpanded(true) }}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition"
          >
            <Plus className="w-4 h-4" />
            Add Category
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded text-sm">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 rounded text-sm">
              {successMsg}
            </div>
          )}

          {showAddForm && (
            <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Category Name</label>
                  <input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="e.g. ADVANCED FLYING"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Color</label>
                  <input
                    type="color"
                    value={newCategoryColor}
                    onChange={(e) => setNewCategoryColor(e.target.value)}
                    className="w-full h-10 px-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 cursor-pointer"
                  />
                </div>
                <button
                  onClick={handleAddCategory}
                  disabled={adding}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded transition disabled:opacity-50"
                >
                  {adding ? 'Creating...' : 'Create'}
                </button>
                <button
                  onClick={() => { setShowAddForm(false); setNewCategoryName(''); setNewCategoryColor('#3B82F6') }}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">Loading categories...</p>
          ) : categories.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No categories found. Create a skill to add categories.</p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={categories.map(c => c.name)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {categories.map(category => (
                    <SortableCategoryRow
                      key={category.name}
                      category={category}
                      editingCategoryName={editingCategoryName}
                      editColor={editColor}
                      setEditColor={setEditColor}
                      setEditingCategoryName={setEditingCategoryName}
                      onColorChange={handleColorChange}
                      onDelete={handleDeleteCategory}
                    />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay>
                {activeId ? (
                  <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 shadow-xl ring-2 ring-blue-400">
                    <div
                      className="w-8 h-8 rounded border-2 border-gray-300 dark:border-gray-600"
                      style={{ backgroundColor: categories.find(c => c.name === activeId)?.color || '#3B82F6' }}
                    />
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {activeId}
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}

          {saving && (
            <div className="mt-3 text-xs text-blue-500 animate-pulse">Saving category order...</div>
          )}

          {categories.length > 0 && !loading && (
            <div className="mt-3 text-xs text-gray-400 dark:text-gray-600">
              {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'} — drag to reorder
            </div>
          )}
        </div>
      )}
    </div>
  )
}
