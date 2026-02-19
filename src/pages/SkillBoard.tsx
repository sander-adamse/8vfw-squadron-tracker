import React, { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { SkillMatrix } from '@/components/SkillMatrix'
import { Pilot, Skill, Qualification, QualificationStatus, Wing } from '@/types'
import { useAuthStore } from '@/store/authStore'
import { Save, Undo2 } from 'lucide-react'

// A pending change
interface PendingChange {
  pilotId: string
  skillId: string
  status: QualificationStatus
}

export const SkillBoard: React.FC = () => {
  const { user } = useAuthStore()
  const [pilots, setPilots] = useState<Pilot[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [qualifications, setQualifications] = useState<Qualification[]>([])
  const [wings, setWings] = useState<Wing[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [selectedWingId, setSelectedWingId] = useState<string | null>(null)
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  const [categoryColors, setCategoryColors] = useState<Record<string, string>>({})
  const [categoryOrder, setCategoryOrder] = useState<string[]>([])

  // Save selected wing to localStorage whenever it changes
  useEffect(() => {
    if (selectedWingId) {
      localStorage.setItem('skillboard_selected_wing', selectedWingId)
    }
  }, [selectedWingId])

  // Fetch category colors and order when selected wing changes
  useEffect(() => {
    if (!selectedWingId) return
    const fetchCategoryData = async () => {
      try {
        const [colorsData, categoriesData] = await Promise.all([
          api.wings.getCategoryColors(selectedWingId),
          api.wings.getCategories(selectedWingId),
        ])
        setCategoryColors(colorsData)
        setCategoryOrder(categoriesData && categoriesData.length > 0 ? categoriesData.map(c => c.category) : [])
      } catch (err) {
        console.error('Error fetching category data:', err)
        // Continue without category data - will use defaults
        setCategoryColors({})
        setCategoryOrder([])
      }
    }
    fetchCategoryData()
  }, [selectedWingId])
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pilotsData, skillsData, qualsData, wingsData] = await Promise.all([
          api.pilots.getAll(),
          api.skills.getAll(),
          api.qualifications.getAll(),
          api.wings.getAll(),
        ])

        setPilots(pilotsData)
        setSkills(skillsData)
        setQualifications(qualsData)
        setWings(wingsData)

        // Try to restore from localStorage, or default to first wing
        if (wingsData.length > 0 && !selectedWingId) {
          const savedWingId = localStorage.getItem('skillboard_selected_wing')
          const wingExists = wingsData.some(w => w.id === savedWingId)
          if (savedWingId && wingExists) {
            setSelectedWingId(savedWingId)
          } else {
            // Default to first wing if saved wing no longer exists
            setSelectedWingId(wingsData[0].id)
          }
        }
      } catch (error) {
        console.error('Error fetching skill board data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const handleCellUpdate = (pilotId: string, skillId: string, status: QualificationStatus) => {
    setPendingChanges(prev => {
      // Check if this change just reverts to the original server state
      const originalQual = qualifications.find(q => q.pilot_id === pilotId && q.skill_id === skillId)
      const originalStatus = originalQual?.status

      if (status === originalStatus) {
        // Remove this from pending changes since it matches the saved state
        return prev.filter(c => !(c.pilotId === pilotId && c.skillId === skillId))
      }

      // Add or replace pending change
      const existing = prev.findIndex(c => c.pilotId === pilotId && c.skillId === skillId)
      if (existing >= 0) {
        const updated = [...prev]
        updated[existing] = { pilotId, skillId, status }
        return updated
      }
      return [...prev, { pilotId, skillId, status }]
    })
  }

   const handleSave = async () => {
     if (pendingChanges.length === 0) return

     setSaving(true)
     setSaveError(null)
     try {
       // Process all changes sequentially to avoid race conditions
       for (const change of pendingChanges) {
         await api.qualifications.update(change.pilotId, change.skillId, change.status)
       }

       // Refetch fresh data from server
       const qualsData = await api.qualifications.getAll()
       setQualifications(qualsData)
       setPendingChanges([])
     } catch (error: any) {
       console.error('Error saving changes:', error)
       setSaveError(error.message || 'Failed to save changes')
     } finally {
       setSaving(false)
     }
   }

  const handleDiscard = () => {
    setPendingChanges([])
  }

   // Build an effective qualifications list that merges server data with pending changes
   const effectiveQualifications = React.useMemo(() => {
     if (pendingChanges.length === 0) return qualifications

     let result = [...qualifications]

     for (const change of pendingChanges) {
       const idx = result.findIndex(q => q.pilot_id === change.pilotId && q.skill_id === change.skillId)

       if (idx >= 0) {
         // Update existing
         result[idx] = { ...result[idx], status: change.status }
       } else {
         // New qualification
         result.push({
           id: `pending-${change.pilotId}-${change.skillId}`,
           pilot_id: change.pilotId,
           skill_id: change.skillId,
           status: change.status,
           last_updated: new Date().toISOString(),
         })
       }
     }

     return result
   }, [qualifications, pendingChanges])

  // Set of changed cell keys for visual highlighting
  const changedCells = React.useMemo(() => {
    return new Set(pendingChanges.map(c => `${c.pilotId}-${c.skillId}`))
  }, [pendingChanges])

  const filteredPilots = selectedWingId ? pilots.filter(p => p.wing_id === selectedWingId) : []

  // Filter skills by selected wing too
  const filteredSkills = selectedWingId ? skills.filter(s => s.wing_id === selectedWingId) : []

  const handleCategoryColorChange = async (category: string, color: string) => {
    if (!selectedWingId) return
    // Optimistic update
    setCategoryColors(prev => ({ ...prev, [category]: color }))
    try {
      await api.wings.setCategoryColor(selectedWingId, category, color)
    } catch (error) {
      console.error('Failed to save category color:', error)
    }
  }

  const canManageCategories = user?.role === 'instructor' || user?.role === 'admin'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Squadron</p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Skill Board</h1>
        </div>

        {/* Save / Discard buttons - only show when there are pending changes */}
        {pendingChanges.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">
              {pendingChanges.length} unsaved change{pendingChanges.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={handleDiscard}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition disabled:opacity-50"
            >
              <Undo2 className="w-4 h-4" />
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm bg-green-600 hover:bg-green-700 text-white transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      {saveError && (
        <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg text-sm">
          {saveError}
        </div>
      )}

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-0 -mb-px" aria-label="Wing tabs">
          {wings.map(wing => (
            <button
              key={wing.id}
              onClick={() => setSelectedWingId(wing.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                selectedWingId === wing.id
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {wing.name}
            </button>
          ))}
        </nav>
      </div>

      {!loading && filteredPilots.length === 0 && selectedWingId && (
        <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
          <p className="text-gray-500 dark:text-gray-400">There are no pilots in this wing.</p>
        </div>
      )}

      {/* Single wing selected — one matrix */}
      {!loading && selectedWingId && filteredPilots.length > 0 && (
         <SkillMatrix
          pilots={filteredPilots}
          skills={filteredSkills}
          qualifications={effectiveQualifications}
          onCellUpdate={canManageCategories ? handleCellUpdate : undefined}
          editable={canManageCategories}
          changedCells={changedCells}
          categoryColors={categoryColors}
          categoryOrder={categoryOrder}
          onCategoryColorChange={canManageCategories ? handleCategoryColorChange : undefined}
        />
      )}

      {loading && <div className="text-center py-12">Loading skill matrix...</div>}
    </div>
  )
}
