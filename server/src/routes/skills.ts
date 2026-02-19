import { Router, Response } from 'express'
import pool from '../db/pool'
import { authenticate, AuthRequest } from '../middleware/auth'

const router = Router()

// GET /api/skills - optionally filter by wing_id
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const wingId = req.query.wing_id as string
    if (wingId) {
      const result = await pool.query(
        'SELECT * FROM skills WHERE wing_id = $1 ORDER BY sort_order, name',
        [wingId]
      )
      res.json(result.rows)
    } else {
      const result = await pool.query('SELECT * FROM skills ORDER BY wing_id, sort_order, name')
      res.json(result.rows)
    }
  } catch (error) {
    console.error('Get skills error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
