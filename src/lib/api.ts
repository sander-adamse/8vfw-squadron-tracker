const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

function getToken(): string | null {
  return localStorage.getItem('token')
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' }
}

async function handleResponse(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || `Request failed: ${res.status}`)
  }
  return res.json()
}

// Auth
export const api = {
  auth: {
    login: async (email: string, password: string) => {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await handleResponse(res)
      localStorage.setItem('token', data.token)
      return data
    },

    register: async (email: string, password: string, callsign: string, firstName: string, lastName: string, wing_id: string) => {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, callsign, firstName, lastName, wing_id }),
      })
      const data = await handleResponse(res)
      localStorage.setItem('token', data.token)
      return data
    },

    me: async () => {
      const res = await fetch(`${API_URL}/auth/me`, { headers: authHeaders() })
      return handleResponse(res)
    },

    signOut: () => {
      localStorage.removeItem('token')
    },
  },

  pilots: {
    getAll: async () => {
      const res = await fetch(`${API_URL}/pilots`, { headers: authHeaders() })
      return handleResponse(res)
    },

    create: async (data: { callsign: string; first_name: string; last_name: string; email: string; wing_id?: string; board_number?: string; role?: string }) => {
      const res = await fetch(`${API_URL}/pilots`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data),
      })
      return handleResponse(res)
    },

    search: async (query: string) => {
      const res = await fetch(`${API_URL}/pilots/search?q=${encodeURIComponent(query)}`, {
        headers: authHeaders(),
      })
      return handleResponse(res)
    },

    getById: async (id: string) => {
      const res = await fetch(`${API_URL}/pilots/${id}`, { headers: authHeaders() })
      return handleResponse(res)
    },
  },

  skills: {
    getAll: async (wingId?: string) => {
      const url = wingId
        ? `${API_URL}/skills?wing_id=${encodeURIComponent(wingId)}`
        : `${API_URL}/skills`
      const res = await fetch(url, { headers: authHeaders() })
      return handleResponse(res)
    },
  },

  qualifications: {
    getAll: async () => {
      const res = await fetch(`${API_URL}/qualifications`, { headers: authHeaders() })
      return handleResponse(res)
    },

    getByPilot: async (pilotId: string) => {
      const res = await fetch(`${API_URL}/qualifications?pilot_id=${pilotId}`, {
        headers: authHeaders(),
      })
      return handleResponse(res)
    },

    update: async (pilotId: string, skillId: string, status: string) => {
      const res = await fetch(`${API_URL}/qualifications`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ pilot_id: pilotId, skill_id: skillId, status }),
      })
      return handleResponse(res)
    },

    getStats: async (wingId?: string) => {
      const url = wingId
        ? `${API_URL}/qualifications/stats?wing_id=${encodeURIComponent(wingId)}`
        : `${API_URL}/qualifications/stats`
      const res = await fetch(url, { headers: authHeaders() })
      return handleResponse(res)
    },

    delete: async (pilotId: string, skillId: string) => {
      const res = await fetch(`${API_URL}/qualifications`, {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({ pilot_id: pilotId, skill_id: skillId }),
      })
      return handleResponse(res)
    },

    exportCsv: async (wingId?: string) => {
      const url = wingId
        ? `${API_URL}/qualifications/export?wing_id=${encodeURIComponent(wingId)}`
        : `${API_URL}/qualifications/export`
      const res = await fetch(url, { headers: authHeaders() })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(body.error || `Export failed: ${res.status}`)
      }
      return res.text()
    },

    bulkImport: async (records: Array<{ callsign: string; skill_name: string; status: string }>) => {
      const res = await fetch(`${API_URL}/qualifications/bulk`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ records }),
      })
      return handleResponse(res)
    },
  },

  wings: {
    getAll: async () => {
      const res = await fetch(`${API_URL}/wings`, { headers: authHeaders() })
      return handleResponse(res)
    },

    getById: async (id: string) => {
      const res = await fetch(`${API_URL}/wings/${id}`, { headers: authHeaders() })
      return handleResponse(res)
    },

    create: async (name: string) => {
      const res = await fetch(`${API_URL}/wings`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name }),
      })
      return handleResponse(res)
    },

    update: async (id: string, name: string) => {
      const res = await fetch(`${API_URL}/wings/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ name }),
      })
      return handleResponse(res)
    },

    delete: async (id: string) => {
      const res = await fetch(`${API_URL}/wings/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      return handleResponse(res)
    },

    addSkill: async (wingId: string, name: string, category: string, sort_order?: number) => {
      const res = await fetch(`${API_URL}/wings/${wingId}/skills`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name, category, sort_order }),
      })
      return handleResponse(res)
    },

    updateSkill: async (wingId: string, skillId: string, data: { name?: string; category?: string; sort_order?: number }) => {
      const res = await fetch(`${API_URL}/wings/${wingId}/skills/${skillId}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(data),
      })
      return handleResponse(res)
    },

    reorderSkills: async (wingId: string, skillIds: string[]) => {
      const res = await fetch(`${API_URL}/wings/${wingId}/skills/reorder`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ skill_ids: skillIds }),
      })
      return handleResponse(res)
    },

    deleteSkill: async (wingId: string, skillId: string) => {
      const res = await fetch(`${API_URL}/wings/${wingId}/skills/${skillId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      return handleResponse(res)
    },

    getCategoryColors: async (wingId: string): Promise<Record<string, string>> => {
      const res = await fetch(`${API_URL}/wings/${wingId}/category-colors`, { headers: authHeaders() })
      return handleResponse(res)
    },

    setCategoryColor: async (wingId: string, category: string, color: string) => {
      const res = await fetch(`${API_URL}/wings/${wingId}/category-colors`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ category, color }),
      })
      return handleResponse(res)
    },

    createCategory: async (wingId: string, category: string, color: string) => {
      const res = await fetch(`${API_URL}/wings/${wingId}/categories`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ category, color }),
      })
      return handleResponse(res)
    },

    getCategories: async (wingId: string): Promise<Array<{ category: string; color: string; sort_order: number }>> => {
      const res = await fetch(`${API_URL}/wings/${wingId}/categories`, { headers: authHeaders() })
      return handleResponse(res)
    },

    reorderCategories: async (wingId: string, categoryOrder: string[]) => {
      const res = await fetch(`${API_URL}/wings/${wingId}/categories/reorder`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ categoryOrder }),
      })
      return handleResponse(res)
    },

    deleteCategory: async (wingId: string, categoryName: string) => {
      const res = await fetch(`${API_URL}/wings/${wingId}/categories/${encodeURIComponent(categoryName)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      return handleResponse(res)
    },
  },

  admin: {
    getUsers: async () => {
      const res = await fetch(`${API_URL}/admin/users`, { headers: authHeaders() })
      return handleResponse(res)
    },

    updateRole: async (userId: string, role: string) => {
      const res = await fetch(`${API_URL}/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ role }),
      })
      return handleResponse(res)
    },

    updateUser: async (userId: string, data: Record<string, string>) => {
      const res = await fetch(`${API_URL}/admin/users/${userId}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(data),
      })
      return handleResponse(res)
    },

    deleteUser: async (userId: string) => {
      const res = await fetch(`${API_URL}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      return handleResponse(res)
    },

    resetPassword: async (userId: string, password: string) => {
      const res = await fetch(`${API_URL}/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ password }),
      })
      return handleResponse(res)
    },

    getSettings: async () => {
      const res = await fetch(`${API_URL}/admin/settings`, { headers: authHeaders() })
      return handleResponse(res)
    },

    updateSettings: async (settings: Record<string, string>) => {
      const res = await fetch(`${API_URL}/admin/settings`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ settings }),
      })
      return handleResponse(res)
    },
  },
}
