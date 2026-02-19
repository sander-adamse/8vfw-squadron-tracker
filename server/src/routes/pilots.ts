import { Router, Response } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import pool from '../db/pool'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'
import { BCRYPT_ROUNDS } from './auth'

const router = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUUID = (v: string) => UUID_RE.test(v)

// POST /api/pilots - create a new pilot + user account
// Accessible by instructors (locked to their wing) and admins (any wing)
router.post('/', authenticate, requireRole('instructor', 'admin'), async (req: AuthRequest, res: Response) => {
  const { callsign, first_name, last_name, email, wing_id, board_number, role } = req.body

  if (!callsign || !first_name || !last_name || !email) {
    return res.status(400).json({ error: 'Callsign, first name, last name, and email are required' })
  }

  // Basic length/format guards
  if (typeof email !== 'string' || email.length > 255) {
    return res.status(400).json({ error: 'Invalid email' })
  }
  if (typeof callsign !== 'string' || callsign.length > 100) {
    return res.status(400).json({ error: 'Callsign must be 100 characters or fewer' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Determine the wing to assign — inside transaction to avoid race conditions
    let targetWingId = wing_id
    if (req.user!.role === 'instructor') {
      const pilotRow = await client.query('SELECT wing_id FROM pilots WHERE user_id = $1', [req.user!.id])
      if (pilotRow.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Your account has no wing assigned' })
      }
      targetWingId = pilotRow.rows[0].wing_id
    } else if (!targetWingId) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Wing is required' })
    }

    // Validate wing exists
    const wingCheck = await client.query('SELECT id FROM wings WHERE id = $1', [targetWingId])
    if (wingCheck.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Wing not found' })
    }

    // Only admins can set roles other than 'pilot'
    const pilotRole = (req.user!.role === 'admin' && role) ? role : 'pilot'
    const validRoles = ['pilot', 'instructor', 'admin']
    if (!validRoles.includes(pilotRole)) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: `Role must be one of: ${validRoles.join(', ')}` })
    }

    // Check email uniqueness inside the transaction
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email])
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'A user with this email already exists' })
    }

    // Generate a secure random temporary password — shown once to the admin
    const tempPassword = crypto.randomBytes(8).toString('hex') // 16 hex chars
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS)

    const userResult = await client.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
      [email, passwordHash, pilotRole]
    )
    const userId = userResult.rows[0].id

    // Create pilot record
    const pilotResult = await client.query(
      `INSERT INTO pilots (user_id, callsign, first_name, last_name, wing_id, board_number, role, email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [userId, callsign.trim(), first_name.trim(), last_name.trim(), targetWingId, board_number?.trim() || null, pilotRole, email]
    )

    await client.query('COMMIT')

    // Return the full pilot record with wing name, plus the one-time temp password
    const result = await pool.query(
      `SELECT p.*, w.name as wing_name
       FROM pilots p
       JOIN wings w ON p.wing_id = w.id
       WHERE p.id = $1`,
      [pilotResult.rows[0].id]
    )

    res.status(201).json({ ...result.rows[0], temp_password: tempPassword })
  } catch (error: any) {
    await client.query('ROLLBACK')
    console.error('Create pilot error:', error)
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A user with this email already exists' })
    }
    res.status(500).json({ error: 'Internal server error' })
  } finally {
    client.release()
  }
})

// GET /api/pilots
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT p.*, w.name as wing_name
       FROM pilots p
       JOIN wings w ON p.wing_id = w.id
       ORDER BY w.name, p.callsign`
    )
    res.json(result.rows)
  } catch (error) {
    console.error('Get pilots error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/pilots/search?q=callsign
router.get('/search', authenticate, async (req: AuthRequest, res: Response) => {
  const query = req.query.q as string
  if (!query) {
    return res.status(400).json({ error: 'Search query required' })
  }

  try {
    const result = await pool.query(
      `SELECT p.*, w.name as wing_name
       FROM pilots p
       JOIN wings w ON p.wing_id = w.id
       WHERE p.callsign ILIKE $1 OR p.email ILIKE $1
       LIMIT 1`,
      [`%${query}%`]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pilot not found' })
    }
    res.json(result.rows[0])
  } catch (error) {
    console.error('Search pilots error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/pilots/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isUUID(req.params.id)) {
    return res.status(400).json({ error: 'Invalid pilot ID' })
  }
  try {
    const result = await pool.query(
      `SELECT p.*, w.name as wing_name
       FROM pilots p
       JOIN wings w ON p.wing_id = w.id
       WHERE p.id = $1`,
      [req.params.id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pilot not found' })
    }
    res.json(result.rows[0])
  } catch (error) {
    console.error('Get pilot error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
