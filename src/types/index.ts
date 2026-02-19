// Type definitions for the DCS Squadron Dashboard
export type QualificationStatus = 'NMQ' | 'MQT' | 'FMQ' | 'IP'

export interface Wing {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export interface Skill {
  id: string
  wing_id: string
  name: string
  category: string
  description?: string
  sort_order: number
  created_at: string
}

export interface Qualification {
  id: string
  pilot_id: string
  skill_id: string
  status: QualificationStatus
  last_updated: string
  updated_by?: string
}

export interface Pilot {
  id: string
  callsign: string
  first_name: string
  last_name: string
  wing_id: string
  wing_name: string
  board_number?: string
  role: 'pilot' | 'instructor' | 'admin'
  email: string
  created_at: string
  updated_at: string
}

export interface PilotProfile extends Pilot {
  qualifications: (Qualification & { skill: Skill })[]
  completion_percentage: number
}

export interface User {
  id: string
  email: string
  role: 'pilot' | 'instructor' | 'admin'
  pilot_id?: string
  wing_id?: string
  wing_name?: string
}

export interface QuickStats {
  total_pilots: number
  combat_ready_pilots: number
  overall_readiness_percentage: number
  average_completion_percentage: number
}

export interface SkillMatrixCell {
  pilot_id: string
  skill_id: string
  callsign: string
  skill_name: string
  status: QualificationStatus | null
}
