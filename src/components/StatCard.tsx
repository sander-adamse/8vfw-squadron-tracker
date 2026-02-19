import React from 'react'

interface StatCardProps {
  title: string
  value: string | number
  icon?: React.ReactNode
  accent?: string // tailwind border-color class e.g. 'border-blue-500'
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, icon, accent = 'border-gray-300 dark:border-gray-600' }) => {
  return (
    <div className={`p-5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 border-l-4 ${accent}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{title}</p>
        {icon && (
          <span className="text-gray-400 dark:text-gray-500">
            {icon}
          </span>
        )}
      </div>
      <p className="text-3xl font-semibold text-gray-900 dark:text-white tabular-nums">
        {value}
      </p>
    </div>
  )
}
