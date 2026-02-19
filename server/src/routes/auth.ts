import { Router, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import pool from '../db/pool'
import { authenticate, AuthRequest } from '../middleware/auth'

const router = Router()

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12')
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h'

// POST /api/auth/login
router.post('/login', async (req: AuthRequest, res: Response) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  // Basic length guards
  if (typeof email !== 'string' || email.length > 255) {
    return res.status(400).json({ error: 'Invalid email' })
  }
  if (typeof password !== 'string' || password.length > 72) {
    return res.status(400).json({ error: 'Invalid password' })
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()])
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const user = result.rows[0]
    const validPassword = await bcrypt.compare(password, user.password_hash)
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Get associated pilot data with wing name
    const pilotResult = await pool.query(
      `SELECT p.id, p.wing_id, w.name as wing_name
       FROM pilots p
       JOIN wings w ON p.wing_id = w.id
       WHERE p.user_id = $1`,
      [user.id]
    )
    const pilot = pilotResult.rows.length > 0 ? pilotResult.rows[0] : null

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, wing_id: pilot?.wing_id },
      process.env.JWT_SECRET!,
      { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN as any }
    )

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        pilot_id: pilot?.id || null,
        wing_id: pilot?.wing_id || null,
        wing_name: pilot?.wing_name || null,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/auth/register — disabled; pilots are created by admins only
router.post('/register', (_req: AuthRequest, res: Response) => {
  return res.status(403).json({ error: 'Self-registration is disabled. Contact an administrator.' })
})

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [req.user!.id])
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const pilotResult = await pool.query(
      `SELECT p.id, p.wing_id, w.name as wing_name
       FROM pilots p
       JOIN wings w ON p.wing_id = w.id
       WHERE p.user_id = $1`,
      [req.user!.id]
    )
    const pilot = pilotResult.rows.length > 0 ? pilotResult.rows[0] : null

    res.json({
      user: {
        ...result.rows[0],
        pilot_id: pilot?.id || null,
        wing_id: pilot?.wing_id || null,
        wing_name: pilot?.wing_name || null,
      },
    })
  } catch (error) {
    console.error('Get user error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export { BCRYPT_ROUNDS, JWT_EXPIRES_IN }
export default router
