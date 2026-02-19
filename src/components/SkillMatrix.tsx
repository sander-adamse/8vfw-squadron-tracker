import React, { useState, useRef, useEffect } from 'react'
import { Qualification, Skill, QualificationStatus } from '@/types'

const PRESET_COLORS = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // green
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
  '#6366F1', // indigo
  '#14B8A6', // teal
  '#84CC16', // lime
  '#78716C', // stone
]

// Lighten a hex color for background use
function hexToLightBg(hex: string, opacity = 0.12): string {
  return `${hex}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`
}

interface ColorPickerProps {
  color: string
  onChange: (color: string) => void
  onClose: () => void
}

const ColorPicker: React.FC<ColorPickerProps> = ({ color, onChange, onClose }) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-2"
      style={{ width: '140px' }}
    >
      <div className="grid grid-cols-4 gap-1.5">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => { onChange(c); onClose() }}
            className={`w-7 h-7 rounded-md border-2 transition-transform hover:scale-110 ${
              c === color ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  )
}

interface SkillMatrixProps {
  pilots: Array<{ id: string; callsign: string; wing_name: string; board_number?: string }>
  skills: Skill[]
  qualifications: Qualification[]
  onCellUpdate?: (pilotId: string, skillId: string, status: QualificationStatus | null) => void
  editable?: boolean
  changedCells?: Set<string>
  categoryColors?: Record<string, string>
  categoryOrder?: string[]
  onCategoryColorChange?: (category: string, color: string) => void
}

// Returns a min column width that grows when there are few pilots so cells
// don't look tiny. With many pilots we shrink to keep the table scannable.
function getPilotColWidth(pilotCount: number): number {
  if (pilotCount <= 3) return 160
  if (pilotCount <= 6) return 120
  if (pilotCount <= 10) return 96
  return 72
}

export const SkillMatrix: React.FC<SkillMatrixProps> = ({
  pilots,
  skills,
  qualifications,
  onCellUpdate,
  editable = false,
  changedCells,
  categoryColors = {},
  categoryOrder = [],
  onCategoryColorChange,
}) => {
  const [colorPickerCategory, setColorPickerCategory] = useState<string | null>(null)
  const colWidth = getPilotColWidth(pilots.length)
  // Cell height scales with column width so the badge has room to breathe
  const cellHeight = colWidth >= 140 ? 48 : colWidth >= 100 ? 40 : 32
  const badgeTextSize = colWidth >= 140 ? 'text-sm' : 'text-xs'

  // Group pilots by wing_name
  const pilotsByWing = pilots.reduce(
    (acc, pilot) => {
      if (!acc[pilot.wing_name]) {
        acc[pilot.wing_name] = []
      }
      acc[pilot.wing_name].push(pilot)
      return acc
    },
    {} as Record<string, typeof pilots>
  )

  // Group skills by category
  const skillsByCategory = skills.reduce(
    (acc, skill) => {
      if (!acc[skill.category]) {
        acc[skill.category] = []
      }
      acc[skill.category].push(skill)
      return acc
    },
    {} as Record<string, typeof skills>
  )

  // Sort categories based on categoryOrder, then alphabetically for any missing
  const sortedCategories = categoryOrder.length > 0
    ? categoryOrder.filter(cat => skillsByCategory[cat])
    : Object.keys(skillsByCategory).sort()

  const getQualification = (pilotId: string, skillId: string) => {
    return qualifications.find((q) => q.pilot_id === pilotId && q.skill_id === skillId)
  }

  const getStatusColor = (status: QualificationStatus | null | undefined) => {
    switch (status) {
      case 'NMQ':
        return 'bg-nmq'
      case 'MQT':
        return 'bg-mqt'
      case 'FMQ':
        return 'bg-fmq'
      case 'IP':
        return 'bg-ip'
      default:
        return 'bg-nmq' // Default to NMQ if status is missing
    }
  }

  const statusOptions: QualificationStatus[] = ['NMQ', 'MQT', 'FMQ', 'IP']

  const getCategoryColor = (category: string) => categoryColors[category] || '#3B82F6'

  return (
    <div className="overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-lg">
      <table className="border-collapse text-sm">
        <thead>
          <tr className="sticky-header border-b border-gray-200 dark:border-gray-800">
            <th
              colSpan={2}
              className="sticky left-0 z-30 p-3 text-left font-semibold bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-800 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400"
              style={{ minWidth: '14.5rem' }}
            >
              Category / Skill
            </th>
            {Object.entries(pilotsByWing).map(([, wingPilots]) =>
              wingPilots.map((pilot) => (
                <th
                  key={pilot.id}
                  className="px-2 py-2 text-center border-r border-gray-200 dark:border-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800"
                  style={{ minWidth: `${colWidth}px`, width: `${colWidth}px` }}
                >
                  <div className="truncate">{pilot.callsign}{pilot.board_number && <span className="font-normal text-gray-400 dark:text-gray-500"> | {pilot.board_number}</span>}</div>
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {sortedCategories.map((category, catIdx) => {
            const categorySkills = skillsByCategory[category]
            const catColor = getCategoryColor(category)

            return (
              <React.Fragment key={category}>
                {categorySkills.map((skill, skillIdx) => (
                  <tr
                    key={skill.id}
                    className={`border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                      skillIdx === 0 && catIdx > 0 ? 'border-t-[3px] border-t-gray-300 dark:border-t-gray-600' : ''
                    }`}
                  >
                    {skillIdx === 0 && (
                      <td
                        rowSpan={categorySkills.length}
                        className="sticky left-0 z-20 w-10 border-r-2 p-0 overflow-hidden"
                        style={{
                          backgroundColor: hexToLightBg(catColor, 0.15),
                          borderRightColor: catColor,
                        }}
                      >
                        <div className="relative w-10 h-full flex items-center justify-center">
                          <button
                            onClick={() =>
                              onCategoryColorChange
                                ? setColorPickerCategory(colorPickerCategory === category ? null : category)
                                : undefined
                            }
                            className={`font-bold text-[11px] whitespace-nowrap uppercase tracking-wide absolute ${
                              onCategoryColorChange ? 'cursor-pointer hover:opacity-70' : 'cursor-default'
                            }`}
                            style={{
                              transform: 'rotate(-90deg)',
                              transformOrigin: 'center center',
                              color: catColor,
                            }}
                            title={onCategoryColorChange ? 'Click to change color' : undefined}
                          >
                            {category}
                          </button>
                          {colorPickerCategory === category && onCategoryColorChange && (
                            <div className="absolute left-10 top-0 z-50">
                              <ColorPicker
                                color={catColor}
                                onChange={(c) => onCategoryColorChange(category, c)}
                                onClose={() => setColorPickerCategory(null)}
                              />
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                    <td className={`sticky left-10 z-20 w-48 p-3 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 font-medium truncate text-gray-900 dark:text-white ${
                      skillIdx === 0 ? 'pt-3' : ''
                    }`}>
                      {skill.name}
                    </td>
                    {Object.entries(pilotsByWing).map(([, wingPilots]) =>
                      wingPilots.map((pilot) => {
                        const qual = getQualification(pilot.id, skill.id)
                        const status = qual?.status

                        return (
                          <td
                            key={`${pilot.id}-${skill.id}`}
                            className={`px-1.5 py-1.5 text-center border-r border-gray-200 dark:border-gray-800 ${
                              editable ? 'cursor-pointer' : ''
                            } ${
                              changedCells?.has(`${pilot.id}-${skill.id}`)
                                ? 'ring-2 ring-amber-400 ring-inset'
                                : ''
                            }`}
                            style={{ height: `${cellHeight}px`, width: `${colWidth}px`, minWidth: `${colWidth}px` }}
                          >
                            {editable && onCellUpdate ? (
                              <select
                                value={status || 'NMQ'}
                                onChange={(e) => {
                                  const value = e.target.value
                                  onCellUpdate(
                                    pilot.id,
                                    skill.id,
                                    value as QualificationStatus
                                  )
                                }}
                                className={`w-full border-0 font-semibold rounded px-1 text-white ${badgeTextSize} ${getStatusColor(status)}`}
                                style={{ height: `${cellHeight - 12}px` }}
                               >
                                 {statusOptions.map((opt) => (
                                   <option key={opt} value={opt}>
                                     {opt}
                                   </option>
                                 ))}
                              </select>
                             ) : (
                               <div
                                 className={`h-full flex items-center justify-center rounded font-semibold text-white ${badgeTextSize} ${getStatusColor(
                                   status || 'NMQ'
                                 )}`}
                               >
                                 {status || 'NMQ'}
                               </div>
                             )}
                          </td>
                        )
                      })
                    )}
                  </tr>
                ))}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
