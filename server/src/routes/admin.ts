import { Router, Response } from 'express'
import bcrypt from 'bcryptjs'
import pool from '../db/pool'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'
import { BCRYPT_ROUNDS } from './auth'

const router = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUUID = (v: string) => UUID_RE.test(v)

// All admin routes require admin role
router.use(authenticate, requireRole('admin'))

// GET /api/admin/users - list all users with their pilot data
router.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.email, u.role, u.created_at, u.updated_at,
        p.id as pilot_id, p.callsign, p.first_name, p.last_name, p.wing_id, w.name as wing_name, p.board_number
      FROM users u
      LEFT JOIN pilots p ON p.user_id = u.id
      LEFT JOIN wings w ON p.wing_id = w.id
      ORDER BY u.created_at ASC
    `)
    res.json(result.rows)
  } catch (error) {
    console.error('Get users error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/admin/users/:id/role - update a user's role
router.put('/users/:id/role', async (req: AuthRequest, res: Response) => {
  const { id } = req.params
  if (!isUUID(id)) return res.status(400).json({ error: 'Invalid user ID' })

  const { role } = req.body
  if (!role) return res.status(400).json({ error: 'Role is required' })

  const validRoles = ['pilot', 'instructor', 'admin']
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${validRoles.join(', ')}` })
  }

  if (id === req.user!.id) {
    return res.status(400).json({ error: 'Cannot change your own role' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const userResult = await client.query(
      'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, role',
      [role, id]
    )
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'User not found' })
    }

    // Keep pilots.role in sync
    await client.query(
      'UPDATE pilots SET role = $1, updated_at = NOW() WHERE user_id = $2',
      [role, id]
    )

    await client.query('COMMIT')
    res.json(userResult.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Update user role error:', error)
    res.status(500).json({ error: 'Internal server error' })
  } finally {
    client.release()
  }
})

// DELETE /api/admin/users/:id - delete a user and their pilot record
router.delete('/users/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params
  if (!isUUID(id)) return res.status(400).json({ error: 'Invalid user ID' })

  if (id === req.user!.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Delete pilot first (cascades to qualifications)
    await client.query('DELETE FROM pilots WHERE user_id = $1', [id])

    const result = await client.query('DELETE FROM users WHERE id = $1 RETURNING id', [id])
    if (result.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'User not found' })
    }

    await client.query('COMMIT')
    res.json({ deleted: true })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Delete user error:', error)
    res.status(500).json({ error: 'Internal server error' })
  } finally {
    client.release()
  }
})

// PUT /api/admin/users/:id - update user details
router.put('/users/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params
  if (!isUUID(id)) return res.status(400).json({ error: 'Invalid user ID' })

  const { email, callsign, first_name, last_name, wing_id, board_number } = req.body

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (email) {
      if (typeof email !== 'string' || email.length > 255) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Invalid email' })
      }
      const existing = await client.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, id])
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: 'Email already in use' })
      }
      await client.query('UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2', [email, id])
    }

    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (callsign) { updates.push(`callsign = $${paramIndex++}`); values.push(callsign) }
    if (first_name) { updates.push(`first_name = $${paramIndex++}`); values.push(first_name) }
    if (last_name) { updates.push(`last_name = $${paramIndex++}`); values.push(last_name) }
    if (wing_id) { updates.push(`wing_id = $${paramIndex++}`); values.push(wing_id) }
    if (board_number !== undefined) { updates.push(`board_number = $${paramIndex++}`); values.push(board_number || null) }
    if (email) { updates.push(`email = $${paramIndex++}`); values.push(email) }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`)
      values.push(id)
      await client.query(
        `UPDATE pilots SET ${updates.join(', ')} WHERE user_id = $${paramIndex}`,
        values
      )
    }

    const result = await client.query(`
      SELECT 
        u.id, u.email, u.role, u.created_at, u.updated_at,
        p.id as pilot_id, p.callsign, p.first_name, p.last_name, p.wing_id, w.name as wing_name, p.board_number
      FROM users u
      LEFT JOIN pilots p ON p.user_id = u.id
      LEFT JOIN wings w ON p.wing_id = w.id
      WHERE u.id = $1
    `, [id])

    if (result.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'User not found' })
    }

    await client.query('COMMIT')
    res.json(result.rows[0])
  } catch (error: any) {
    await client.query('ROLLBACK')
    console.error('Update user error:', error)
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email already in use' })
    }
    res.status(500).json({ error: 'Internal server error' })
  } finally {
    client.release()
  }
})

// POST /api/admin/users/:id/reset-password
router.post('/users/:id/reset-password', async (req: AuthRequest, res: Response) => {
  const { id } = req.params
  if (!isUUID(id)) return res.status(400).json({ error: 'Invalid user ID' })

  const { password } = req.body
  if (!password || typeof password !== 'string' || password.length < 8 || password.length > 72) {
    return res.status(400).json({ error: 'Password must be between 8 and 72 characters' })
  }

  try {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const result = await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id',
      [hash, id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }
    res.json({ success: true })
  } catch (error) {
    console.error('Reset password error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/admin/settings
router.get('/settings', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT key, value, description FROM settings ORDER BY key')
    const settings = result.rows.reduce((acc: Record<string, string>, row: any) => {
      acc[row.key] = row.value
      return acc
    }, {})
    res.json(settings)
  } catch (error) {
    console.error('Get settings error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/admin/settings
const ALLOWED_SETTINGS_KEYS = new Set(['nav_title', 'nav_color', 'nav_icon', 'app_subtitle'])

router.put('/settings', async (req: AuthRequest, res: Response) => {
  const { settings } = req.body
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Settings object is required' })
  }

  for (const [key, value] of Object.entries(settings)) {
    if (!ALLOWED_SETTINGS_KEYS.has(key)) {
      return res.status(400).json({ error: `Unknown setting key: ${key}` })
    }
    if (typeof value !== 'string' || value.length > 500) {
      return res.status(400).json({ error: `Invalid value for setting: ${key}` })
    }
  }

  try {
    for (const [key, value] of Object.entries(settings)) {
      await pool.query(
        'UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2',
        [value, key]
      )
    }
    res.json({ success: true, message: 'Settings updated' })
  } catch (error) {
    console.error('Update settings error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
