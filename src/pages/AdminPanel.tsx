import React, { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { Trash2, KeyRound, Pencil, X, Check, Plus } from 'lucide-react'
import { Wing } from '@/types'

interface AdminUser {
  id: string
  email: string
  role: string
  created_at: string
  updated_at: string
  pilot_id: string | null
  callsign: string | null
  first_name: string | null
  last_name: string | null
  wing_id: string | null
  wing_name: string | null
  board_number: string | null
}

// ── Shared input / label styles ──────────────────────────────
const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-pink-500', 'bg-indigo-500',
]
function avatarColor(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

const WING_ACCENT_COLORS = [
  'border-blue-500', 'border-violet-500', 'border-emerald-500',
  'border-amber-500', 'border-rose-500', 'border-cyan-500',
]
function wingAccent(idx: number) {
  return WING_ACCENT_COLORS[idx % WING_ACCENT_COLORS.length]
}

const roleColors: Record<string, string> = {
  admin:      'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700',
  instructor: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700',
  pilot:      'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700',
}

export const AdminPanel: React.FC = () => {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<'users' | 'wings'>('users')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [wings, setWings] = useState<Wing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // user editing state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [resetPasswordId, setResetPasswordId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // create user state
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({ callsign: '', first_name: '', last_name: '', email: '', wing_id: '', role: 'pilot', board_number: '' })

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersData, wingsData] = await Promise.all([
          api.admin.getUsers(),
          api.wings.getAll(),
        ])
        setUsers(usersData)
        setWings(wingsData)
      } catch (err: any) {
        setError(err.message || 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  const handleRoleChange = async (userId: string, role: string) => {
    setError(null)
    try {
      await api.admin.updateRole(userId, role)
      setUsers(users.map(u => u.id === userId ? { ...u, role } : u))
      showSuccess('Role updated')
    } catch (err: any) { setError(err.message || 'Failed to update role') }
  }

  const handleDelete = async (userId: string) => {
    setError(null)
    try {
      await api.admin.deleteUser(userId)
      setUsers(users.filter(u => u.id !== userId))
      setDeleteConfirmId(null)
      showSuccess('User deleted')
    } catch (err: any) { setError(err.message || 'Failed to delete user') }
  }

  const handleResetPassword = async (userId: string) => {
    if (!newPassword || newPassword.length < 6) { setError('Password must be at least 6 characters'); return }
    setError(null)
    try {
      await api.admin.resetPassword(userId, newPassword)
      setResetPasswordId(null)
      setNewPassword('')
      showSuccess('Password reset')
    } catch (err: any) { setError(err.message || 'Failed to reset password') }
  }

  const startEditing = (u: AdminUser) => {
    setEditingId(u.id)
    setEditForm({ email: u.email, callsign: u.callsign || '', first_name: u.first_name || '', last_name: u.last_name || '', wing_id: u.wing_id || '', board_number: u.board_number || '' })
  }

  const handleSaveEdit = async (userId: string) => {
    setError(null)
    try {
      const updated = await api.admin.updateUser(userId, editForm)
      setUsers(users.map(u => u.id === userId ? updated : u))
      setEditingId(null)
      showSuccess('User updated')
    } catch (err: any) { setError(err.message || 'Failed to update user') }
  }

  const handleCreateUser = async () => {
    if (!createForm.callsign.trim() || !createForm.first_name.trim() || !createForm.last_name.trim() || !createForm.email.trim() || !createForm.wing_id) {
      setError('All fields are required')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const result = await api.pilots.create({ callsign: createForm.callsign.trim(), first_name: createForm.first_name.trim(), last_name: createForm.last_name.trim(), email: createForm.email.trim(), wing_id: createForm.wing_id, role: createForm.role, board_number: createForm.board_number.trim() || undefined })
      setCreateForm({ callsign: '', first_name: '', last_name: '', email: '', wing_id: '', role: 'pilot', board_number: '' })
      setShowCreateForm(false)
      showSuccess(`User created — temporary password: ${result.temp_password}`)
      const usersData = await api.admin.getUsers()
      setUsers(usersData)
    } catch (err: any) { setError(err.message || 'Failed to create user') }
    finally { setCreating(false) }
  }

  if (loading) return <div className="text-center py-12 text-sm text-gray-400">Loading...</div>

  return (
    <div className="space-y-6 pb-12">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Admin</p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Panel</h1>
        </div>
      </div>

      {/* Feedback */}
      {error && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg text-sm">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="px-4 py-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 rounded-lg text-sm">
          {successMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-800">
        <nav className="flex gap-0 -mb-px">
          {(['users', 'wings'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Users tab ── */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400 dark:text-gray-500">{users.length} user{users.length !== 1 ? 's' : ''}</p>
            <button
              onClick={() => { setShowCreateForm(!showCreateForm); setError(null) }}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition"
            >
              <Plus className="w-4 h-4" />
              Add User
            </button>
          </div>

          {/* Create user form */}
          {showCreateForm && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-5 space-y-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">New user</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: 'Callsign', key: 'callsign', placeholder: 'VIPER' },
                  { label: 'Board #', key: 'board_number', placeholder: '118' },
                  { label: 'First name', key: 'first_name', placeholder: 'John' },
                  { label: 'Last name', key: 'last_name', placeholder: 'Smith' },
                  { label: 'Email', key: 'email', placeholder: 'john@example.com' },
                ].map(({ label, key, placeholder }) => (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <input
                      value={createForm[key as keyof typeof createForm]}
                      onChange={e => setCreateForm({ ...createForm, [key]: e.target.value })}
                      placeholder={placeholder}
                      className={inputCls}
                    />
                  </div>
                ))}
                <div>
                  <label className={labelCls}>Wing</label>
                  <select value={createForm.wing_id} onChange={e => setCreateForm({ ...createForm, wing_id: e.target.value })} className={inputCls}>
                    <option value="">Select...</option>
                    {wings.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Role</label>
                  <select value={createForm.role} onChange={e => setCreateForm({ ...createForm, role: e.target.value })} className={inputCls}>
                    <option value="pilot">Pilot</option>
                    <option value="instructor">Instructor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button onClick={handleCreateUser} disabled={creating} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition disabled:opacity-50">
                  {creating ? 'Creating...' : 'Create'}
                </button>
                                 <button onClick={() => { setShowCreateForm(false); setCreateForm({ callsign: '', first_name: '', last_name: '', email: '', wing_id: '', role: 'pilot', board_number: '' }) }} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition">
                  Cancel
                </button>
                <p className="ml-auto text-xs text-gray-400 dark:text-gray-500">A temporary password will be shown after creation.</p>
              </div>
            </div>
          )}

          {/* Users table */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Callsign</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider hidden md:table-cell">Board #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider hidden md:table-cell">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider hidden lg:table-cell">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider hidden sm:table-cell">Wing</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {users.map(u => {
                  const isMe = u.id === user?.id
                  const isEditing = editingId === u.id
                  return (
                    <React.Fragment key={u.id}>
                      <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                        {/* Callsign */}
                        <td className="px-4 py-3">
                          {isEditing
                            ? <input value={editForm.callsign} onChange={e => setEditForm({ ...editForm, callsign: e.target.value })} className={inputCls} />
                            : <div className="flex items-center gap-2">
                                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 ${avatarColor(u.callsign || u.email)}`}>
                                  {(u.callsign || u.email).slice(0, 1).toUpperCase()}
                                </div>
                                <span className="font-medium text-gray-900 dark:text-white">{u.callsign || '—'}</span>
                              </div>
                          }
                        </td>
                        {/* Board # */}
                         <td className="px-4 py-3 hidden md:table-cell">
                           {isEditing
                             ? <input value={editForm.board_number || ''} onChange={e => setEditForm({ ...editForm, board_number: e.target.value })} placeholder="118" className={inputCls} />
                             : <span className="text-gray-500 dark:text-gray-400 text-xs font-mono">{u.board_number || '—'}</span>
                           }
                         </td>
                        {/* Name */}
                         <td className="px-4 py-3 hidden md:table-cell">
                           {isEditing
                             ? <div className="flex gap-2">
                                 <input value={editForm.first_name} onChange={e => setEditForm({ ...editForm, first_name: e.target.value })} placeholder="First" className={inputCls} />
                                 <input value={editForm.last_name} onChange={e => setEditForm({ ...editForm, last_name: e.target.value })} placeholder="Last" className={inputCls} />
                               </div>
                             : <span className="text-gray-600 dark:text-gray-400">{u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : '—'}</span>
                           }
                         </td>
                        {/* Email */}
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {isEditing
                            ? <input value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className={inputCls} />
                            : <span className="text-gray-500 dark:text-gray-400 text-xs">{u.email}</span>
                          }
                        </td>
                        {/* Wing */}
                        <td className="px-4 py-3 hidden sm:table-cell">
                          {isEditing
                            ? <select value={editForm.wing_id} onChange={e => setEditForm({ ...editForm, wing_id: e.target.value })} className={inputCls}>
                                <option value="">—</option>
                                {wings.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                              </select>
                            : <span className="text-gray-500 dark:text-gray-400 text-xs">{u.wing_name || '—'}</span>
                          }
                        </td>
                        {/* Role */}
                        <td className="px-4 py-3">
                          <select
                            value={u.role}
                            onChange={e => handleRoleChange(u.id, e.target.value)}
                            disabled={isMe}
                            className={`px-2 py-1 rounded text-xs font-medium ${roleColors[u.role] || roleColors.pilot} ${isMe ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <option value="pilot">Pilot</option>
                            <option value="instructor">Instructor</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {isEditing ? (
                              <>
                                <button onClick={() => handleSaveEdit(u.id)} className="p-1.5 rounded hover:bg-green-100 dark:hover:bg-green-900/40 text-green-600 dark:text-green-400 transition" title="Save"><Check className="w-4 h-4" /></button>
                                <button onClick={() => setEditingId(null)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition" title="Cancel"><X className="w-4 h-4" /></button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => startEditing(u)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition" title="Edit"><Pencil className="w-4 h-4" /></button>
                                <button onClick={() => { setResetPasswordId(resetPasswordId === u.id ? null : u.id); setNewPassword('') }} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition" title="Reset password"><KeyRound className="w-4 h-4" /></button>
                                {!isMe && <button onClick={() => setDeleteConfirmId(deleteConfirmId === u.id ? null : u.id)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition" title="Delete"><Trash2 className="w-4 h-4" /></button>}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Reset password inline */}
                      {resetPasswordId === u.id && (
                        <tr className="bg-gray-50 dark:bg-gray-800/30">
                           <td colSpan={7} className="px-4 py-3">
                             <div className="flex items-center gap-3">
                               <span className="text-xs text-gray-500 dark:text-gray-400">New password for <strong>{u.callsign || u.email}</strong></span>
                              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 6 characters" className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white w-44 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                              <button onClick={() => handleResetPassword(u.id)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition">Reset</button>
                              <button onClick={() => { setResetPasswordId(null); setNewPassword('') }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">Cancel</button>
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* Delete confirmation inline */}
                      {deleteConfirmId === u.id && (
                        <tr className="bg-red-50 dark:bg-red-950/20">
                           <td colSpan={7} className="px-4 py-3">
                             <div className="flex items-center gap-3">
                               <span className="text-xs text-red-700 dark:text-red-300">Delete <strong>{u.callsign || u.email}</strong>? This removes all their qualifications.</span>
                              <button onClick={() => handleDelete(u.id)} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-md transition">Delete</button>
                              <button onClick={() => setDeleteConfirmId(null)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">Cancel</button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Wings tab ── */}
      {tab === 'wings' && (
        <WingsTab wings={wings} onWingsChanged={async () => { const w = await api.wings.getAll(); setWings(w) }} showSuccess={showSuccess} setError={setError} />
      )}

    </div>
  )
}

// ── Wings tab ────────────────────────────────────────────────

const WingsTab: React.FC<{
  wings: Wing[]
  onWingsChanged: () => Promise<void>
  showSuccess: (msg: string) => void
  setError: (msg: string | null) => void
}> = ({ wings, onWingsChanged, showSuccess, setError }) => {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newWingName, setNewWingName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!newWingName.trim()) { setError('Wing name is required'); return }
    setAdding(true); setError(null)
    try {
      await api.wings.create(newWingName.trim())
      setNewWingName(''); setShowAddForm(false)
      await onWingsChanged(); showSuccess('Wing created')
    } catch (err: any) { setError(err.message || 'Failed to create wing') }
    finally { setAdding(false) }
  }

  const handleRename = async (wingId: string) => {
    if (!editName.trim()) { setError('Wing name is required'); return }
    setError(null)
    try {
      await api.wings.update(wingId, editName.trim())
      setEditingId(null); setEditName('')
      await onWingsChanged(); showSuccess('Wing renamed')
    } catch (err: any) { setError(err.message || 'Failed to rename wing') }
  }

  const handleDelete = async (wingId: string) => {
    setError(null)
    try {
      await api.wings.delete(wingId)
      setDeleteConfirmId(null)
      await onWingsChanged(); showSuccess('Wing deleted')
    } catch (err: any) { setError(err.message || 'Failed to delete wing') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 dark:text-gray-500">{wings.length} wing{wings.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setShowAddForm(!showAddForm)} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition">
          <Plus className="w-4 h-4" /> Add Wing
        </button>
      </div>

      {showAddForm && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Wing name</label>
          <div className="flex gap-2">
            <input
              value={newWingName}
              onChange={e => setNewWingName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. VFA-143 Pukin Dogs"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            <button onClick={handleCreate} disabled={adding} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition disabled:opacity-50">
              {adding ? 'Adding...' : 'Add'}
            </button>
            <button onClick={() => { setShowAddForm(false); setNewWingName('') }} className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
        {wings.length === 0 && (
          <p className="px-4 py-6 text-sm text-gray-400 dark:text-gray-500 text-center">No wings yet.</p>
        )}
        {wings.map((wing, idx) => (
          <div key={wing.id} className={`flex items-center gap-3 pl-3 pr-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors group border-l-4 ${wingAccent(idx)}`}>
            {editingId === wing.id ? (
              <>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRename(wing.id); if (e.key === 'Escape') { setEditingId(null); setEditName('') } }}
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                />
                <button onClick={() => handleRename(wing.id)} className="p-1.5 rounded hover:bg-green-100 dark:hover:bg-green-900/40 text-green-600 dark:text-green-400 transition"><Check className="w-4 h-4" /></button>
                <button onClick={() => { setEditingId(null); setEditName('') }} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition"><X className="w-4 h-4" /></button>
              </>
            ) : deleteConfirmId === wing.id ? (
              <>
                <span className="flex-1 text-sm text-red-700 dark:text-red-300">Delete <strong>{wing.name}</strong>?</span>
                <button onClick={() => handleDelete(wing.id)} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-md transition">Delete</button>
                <button onClick={() => setDeleteConfirmId(null)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">Cancel</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white">{wing.name}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditingId(wing.id); setEditName(wing.name) }} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition" title="Rename"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setDeleteConfirmId(wing.id)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
