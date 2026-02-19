import { Router, Response } from 'express'
import pool from '../db/pool'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'

const router = Router()

// Sanitize a CSV field value to prevent formula injection
function csvSafe(value: string): string {
  const s = String(value ?? '')
  // Strip leading chars that spreadsheet apps interpret as formulas
  return s.replace(/^[=+\-@\t\r]+/, '')
}

// GET /api/qualifications
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const pilotId = req.query.pilot_id as string
    let result

    if (pilotId) {
      result = await pool.query(
        'SELECT * FROM qualifications WHERE pilot_id = $1 ORDER BY skill_id',
        [pilotId]
      )
    } else {
      result = await pool.query('SELECT * FROM qualifications ORDER BY pilot_id, skill_id')
    }

    res.json(result.rows)
  } catch (error) {
    console.error('Get qualifications error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/qualifications
router.put('/', authenticate, requireRole('instructor', 'admin'), async (req: AuthRequest, res: Response) => {
  const { pilot_id, skill_id, status } = req.body

  if (!pilot_id || !skill_id || !status) {
    return res.status(400).json({ error: 'pilot_id, skill_id, and status are required' })
  }

  const validStatuses = ['NMQ', 'MQT', 'FMQ', 'IP']
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` })
  }

  try {
    // Check if instructor is editing a pilot in their own wing
    if (req.user!.role === 'instructor') {
      const pilotCheck = await pool.query('SELECT wing_id FROM pilots WHERE id = $1', [pilot_id])
      if (pilotCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Pilot not found' })
      }
      if (pilotCheck.rows[0].wing_id !== req.user!.wing_id) {
        return res.status(403).json({ error: 'Instructors can only edit pilots in their own wing' })
      }

      const skillCheck = await pool.query('SELECT wing_id FROM skills WHERE id = $1', [skill_id])
      if (skillCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Skill not found' })
      }
      if (skillCheck.rows[0].wing_id !== req.user!.wing_id) {
        return res.status(403).json({ error: 'Skill does not belong to your wing' })
      }
    }

    const result = await pool.query(
      `INSERT INTO qualifications (pilot_id, skill_id, status, last_updated, updated_by)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (pilot_id, skill_id)
       DO UPDATE SET status = $3, last_updated = NOW(), updated_by = $4
       RETURNING *`,
      [pilot_id, skill_id, status, req.user!.email]
    )

    res.json(result.rows[0])
  } catch (error) {
    console.error('Update qualification error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/qualifications
router.delete('/', authenticate, requireRole('instructor', 'admin'), async (req: AuthRequest, res: Response) => {
  const { pilot_id, skill_id } = req.body

  if (!pilot_id || !skill_id) {
    return res.status(400).json({ error: 'pilot_id and skill_id are required' })
  }

  try {
    if (req.user!.role === 'instructor') {
      const pilotCheck = await pool.query('SELECT wing_id FROM pilots WHERE id = $1', [pilot_id])
      if (pilotCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Pilot not found' })
      }
      if (pilotCheck.rows[0].wing_id !== req.user!.wing_id) {
        return res.status(403).json({ error: 'Instructors can only edit pilots in their own wing' })
      }
    }

    const result = await pool.query(
      'DELETE FROM qualifications WHERE pilot_id = $1 AND skill_id = $2 RETURNING *',
      [pilot_id, skill_id]
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Qualification not found' })
    }

    res.json({ deleted: true })
  } catch (error) {
    console.error('Delete qualification error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/qualifications/export
router.get('/export', authenticate, requireRole('instructor', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    // Instructors are scoped to their own wing; admins may pass an optional wing_id
    let wingId = req.query.wing_id as string | undefined
    if (req.user!.role === 'instructor') {
      wingId = req.user!.wing_id
    }

    let query: string
    let params: any[] = []

    if (wingId) {
      query = `
        SELECT 
          p.callsign, p.first_name, p.last_name, w.name as wing_name,
          s.name as skill_name, s.category, q.status, q.last_updated, q.updated_by
        FROM pilots p
        JOIN wings w ON p.wing_id = w.id
        CROSS JOIN skills s
        LEFT JOIN qualifications q ON q.pilot_id = p.id AND q.skill_id = s.id
        WHERE p.wing_id = $1 AND s.wing_id = $1
        ORDER BY p.callsign, s.sort_order
      `
      params = [wingId]
    } else {
      query = `
        SELECT 
          p.callsign, p.first_name, p.last_name, w.name as wing_name,
          s.name as skill_name, s.category, q.status, q.last_updated, q.updated_by
        FROM pilots p
        JOIN wings w ON p.wing_id = w.id
        CROSS JOIN skills s
        LEFT JOIN qualifications q ON q.pilot_id = p.id AND q.skill_id = s.id
        WHERE s.wing_id = p.wing_id
        ORDER BY w.name, p.callsign, s.sort_order
      `
    }

    const result = await pool.query(query, params)

    const headers = ['Callsign', 'First Name', 'Last Name', 'Wing', 'Category', 'Skill', 'Status', 'Last Updated', 'Updated By']
    const csvLines = [headers.join(',')]

    for (const row of result.rows) {
      const line = [
        `"${csvSafe(row.callsign)}"`,
        `"${csvSafe(row.first_name)}"`,
        `"${csvSafe(row.last_name)}"`,
        `"${csvSafe(row.wing_name)}"`,
        `"${csvSafe(row.category)}"`,
        `"${csvSafe(row.skill_name)}"`,
        `"${csvSafe(row.status || '')}"`,
        `"${row.last_updated || ''}"`,
        `"${csvSafe(row.updated_by || '')}"`,
      ].join(',')
      csvLines.push(line)
    }

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename=qualifications_export.csv')
    res.send(csvLines.join('\n'))
  } catch (error) {
    console.error('Export error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/qualifications/bulk - bulk import qualifications from CSV data
router.post('/bulk', authenticate, requireRole('instructor', 'admin'), async (req: AuthRequest, res: Response) => {
  const { records } = req.body

  if (!records || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'records array is required' })
  }

  if (records.length > 1000) {
    return res.status(400).json({ error: 'Maximum 1000 records per import' })
  }

  const validStatuses = ['NMQ', 'MQT', 'FMQ', 'IP']
  let imported = 0
  let skipped = 0
  const errors: string[] = []

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      const { callsign, skill_name, status } = record

      if (!callsign || !skill_name || !status) {
        errors.push(`Row ${i + 1}: missing callsign, skill_name, or status`)
        skipped++
        continue
      }

      if (!validStatuses.includes(status.toUpperCase())) {
        errors.push(`Row ${i + 1}: invalid status "${status}"`)
        skipped++
        continue
      }

      const pilotResult = await client.query(
        'SELECT id, wing_id FROM pilots WHERE callsign ILIKE $1',
        [callsign.trim()]
      )
      if (pilotResult.rows.length === 0) {
        errors.push(`Row ${i + 1}: pilot "${callsign}" not found`)
        skipped++
        continue
      }

      const pilotId = pilotResult.rows[0].id
      const pilotWingId = pilotResult.rows[0].wing_id

      if (req.user!.role === 'instructor' && pilotWingId !== req.user!.wing_id) {
        errors.push(`Row ${i + 1}: pilot "${callsign}" is not in your wing`)
        skipped++
        continue
      }

      const skillResult = await client.query(
        'SELECT id, wing_id FROM skills WHERE name ILIKE $1',
        [skill_name.trim()]
      )
      if (skillResult.rows.length === 0) {
        errors.push(`Row ${i + 1}: skill "${skill_name}" not found`)
        skipped++
        continue
      }

      const skillId = skillResult.rows[0].id
      const skillWingId = skillResult.rows[0].wing_id

      if (skillWingId !== pilotWingId) {
        errors.push(`Row ${i + 1}: skill "${skill_name}" does not belong to pilot's wing`)
        skipped++
        continue
      }

      if (req.user!.role === 'instructor' && skillWingId !== req.user!.wing_id) {
        errors.push(`Row ${i + 1}: skill "${skill_name}" is not in your wing`)
        skipped++
        continue
      }

      await client.query(
        `INSERT INTO qualifications (pilot_id, skill_id, status, last_updated, updated_by)
         VALUES ($1, $2, $3, NOW(), $4)
         ON CONFLICT (pilot_id, skill_id)
         DO UPDATE SET status = $3, last_updated = NOW(), updated_by = $4`,
        [pilotId, skillId, status.toUpperCase(), req.user!.email]
      )
      imported++
    }

    await client.query('COMMIT')
    res.json({ imported, skipped, errors: errors.slice(0, 20) })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Bulk import error:', error)
    res.status(500).json({ error: 'Internal server error' })
  } finally {
    client.release()
  }
})

// GET /api/qualifications/stats
router.get('/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const wingId = req.query.wing_id as string

    let totalPilotsQuery: string
    let totalPilotsParams: any[] = []
    let combatReadyQuery: string
    let combatReadyParams: any[] = []
    let completionQuery: string
    let completionParams: any[] = []

    if (wingId) {
      totalPilotsQuery = 'SELECT COUNT(*) FROM pilots WHERE wing_id = $1'
      totalPilotsParams = [wingId]

      combatReadyQuery = `
        SELECT COUNT(DISTINCT pilot_id) as combat_ready_pilots
        FROM (
          SELECT q.pilot_id, COUNT(*) as fmq_count
          FROM qualifications q
          JOIN pilots p ON q.pilot_id = p.id
          WHERE q.status IN ('FMQ', 'IP') AND p.wing_id = $1
          GROUP BY q.pilot_id
          HAVING COUNT(*) >= 3
        ) combat_ready
      `
      combatReadyParams = [wingId]

      completionQuery = `
        SELECT 
          p.id,
          COUNT(q.id) FILTER (WHERE q.status IN ('FMQ', 'IP')) as qualified_count,
          COUNT(q.id) as total_qualifications,
          (SELECT COUNT(*) FROM skills WHERE wing_id = $1) as total_skills
        FROM pilots p
        LEFT JOIN qualifications q ON p.id = q.pilot_id AND (SELECT wing_id FROM skills WHERE id = q.skill_id) = $1
        WHERE p.wing_id = $1
        GROUP BY p.id
      `
      completionParams = [wingId]
    } else {
      totalPilotsQuery = 'SELECT COUNT(*) FROM pilots'

      combatReadyQuery = `
        SELECT COUNT(DISTINCT pilot_id) as combat_ready_pilots
        FROM (
          SELECT pilot_id, COUNT(*) as fmq_count
          FROM qualifications 
          WHERE status IN ('FMQ', 'IP')
          GROUP BY pilot_id
          HAVING COUNT(*) >= 3
        ) combat_ready
      `

      completionQuery = `
        SELECT 
          p.id,
          COUNT(q.id) FILTER (WHERE q.status IN ('FMQ', 'IP')) as qualified_count,
          COUNT(q.id) as total_qualifications,
          (SELECT COUNT(*) FROM skills s WHERE s.wing_id = p.wing_id) as total_skills
        FROM pilots p
        LEFT JOIN qualifications q ON p.id = q.pilot_id
        GROUP BY p.id, p.wing_id
      `
    }

    const [totalResult, combatResult, completionResult] = await Promise.all([
      pool.query(totalPilotsQuery, totalPilotsParams),
      pool.query(combatReadyQuery, combatReadyParams),
      pool.query(completionQuery, completionParams),
    ])

    const totalPilots = parseInt(totalResult.rows[0].count)
    const combatReadyPilots = parseInt(combatResult.rows[0].combat_ready_pilots)

    const avgCompletion = completionResult.rows.length > 0
      ? completionResult.rows.reduce((sum, row) => {
          const total = parseInt(row.total_qualifications) || parseInt(row.total_skills) || 1
          return sum + (parseInt(row.qualified_count) / total) * 100
        }, 0) / completionResult.rows.length
      : 0

    res.json({
      total_pilots: totalPilots,
      combat_ready_pilots: combatReadyPilots,
      overall_readiness_percentage: totalPilots > 0 ? (combatReadyPilots / totalPilots) * 100 : 0,
      average_completion_percentage: avgCompletion,
    })
  } catch (error) {
    console.error('Get stats error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/qualifications/backfill
router.post('/backfill', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(`
      INSERT INTO qualifications (pilot_id, skill_id, status, last_updated, updated_by)
      SELECT p.id, s.id, 'NMQ', NOW(), $1
      FROM pilots p
      CROSS JOIN skills s
      WHERE s.wing_id = p.wing_id
        AND NOT EXISTS (
          SELECT 1 FROM qualifications q 
          WHERE q.pilot_id = p.id AND q.skill_id = s.id
        )
      ON CONFLICT (pilot_id, skill_id) DO NOTHING
    `, [req.user!.email])

    res.json({ message: 'Backfill completed successfully', rowsInserted: result.rowCount })
  } catch (error) {
    console.error('Backfill error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
