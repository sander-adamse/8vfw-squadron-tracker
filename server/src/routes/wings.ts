import { Router, Response } from 'express'
import pool from '../db/pool'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'

const router = Router()

// GET /api/wings - list all wings
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM wings ORDER BY name')
    res.json(result.rows)
  } catch (error) {
    console.error('Get wings error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/wings/:id - get a single wing with its skills
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const wingResult = await pool.query('SELECT * FROM wings WHERE id = $1', [req.params.id])
    if (wingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Wing not found' })
    }

    const skillsResult = await pool.query(
      'SELECT * FROM skills WHERE wing_id = $1 ORDER BY sort_order, name',
      [req.params.id]
    )

    res.json({
      ...wingResult.rows[0],
      skills: skillsResult.rows,
    })
  } catch (error) {
    console.error('Get wing error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/wings - create a new wing
router.post('/', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const { name } = req.body

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Wing name is required' })
  }

  try {
    const result = await pool.query(
      'INSERT INTO wings (name) VALUES ($1) RETURNING *',
      [name.trim()]
    )
    res.status(201).json(result.rows[0])
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A wing with this name already exists' })
    }
    console.error('Create wing error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/wings/:id - update a wing
router.put('/:id', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const { name } = req.body

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Wing name is required' })
  }

  try {
    const result = await pool.query(
      'UPDATE wings SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [name.trim(), req.params.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Wing not found' })
    }

    res.json(result.rows[0])
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A wing with this name already exists' })
    }
    console.error('Update wing error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/wings/:id - delete a wing
router.delete('/:id', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    // Check if wing has pilots
    const pilotCheck = await pool.query('SELECT COUNT(*) FROM pilots WHERE wing_id = $1', [req.params.id])
    if (parseInt(pilotCheck.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete a wing that has pilots assigned to it' })
    }

    const result = await pool.query('DELETE FROM wings WHERE id = $1 RETURNING id', [req.params.id])
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Wing not found' })
    }

    res.json({ deleted: true })
  } catch (error) {
    console.error('Delete wing error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/wings/:id/category-colors - get category colors for a wing (legacy, returns map)
router.get('/:id/category-colors', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT category, color FROM category_colors WHERE wing_id = $1 ORDER BY sort_order, category',
      [req.params.id]
    )
    // Return as a { category: color } map
    const colorMap: Record<string, string> = {}
    for (const row of result.rows) {
      colorMap[row.category] = row.color
    }
    res.json(colorMap)
  } catch (error) {
    console.error('Get category colors error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/wings/:id/categories - get all categories with colors and order for a wing
router.get('/:id/categories', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Get all distinct categories from skills for this wing
    const skillsQuery = await pool.query(
      'SELECT DISTINCT category FROM skills WHERE wing_id = $1',
      [req.params.id]
    )

    const categories = skillsQuery.rows

    // If no skills/categories, return empty array
    if (categories.length === 0) {
      return res.json([])
    }

    // Get categories with their colors and sort order from category_colors table
    const categoryNames = categories.map(c => c.category)
    const colorsQuery = await pool.query(
      `SELECT category, color, sort_order FROM category_colors 
       WHERE wing_id = $1 AND category = ANY($2::text[])
       ORDER BY sort_order, category`,
      [req.params.id, categoryNames]
    )

    // Create a map of existing colors
    const colorMap = new Map(colorsQuery.rows.map(c => [c.category, c]))

    // Combine: use colors if they exist, otherwise use defaults
    const result = categories.map((cat, idx) => {
      const existing = colorMap.get(cat.category)
      return {
        category: cat.category,
        color: existing?.color || '#3B82F6',
        sort_order: existing?.sort_order ?? idx,
      }
    })

    // Sort by sort_order
    result.sort((a, b) => a.sort_order - b.sort_order || a.category.localeCompare(b.category))

    res.json(result)
  } catch (error) {
    console.error('Get categories error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/wings/:id/category-colors - set a category color for a wing
router.put('/:id/category-colors', authenticate, requireRole('instructor', 'admin'), async (req: AuthRequest, res: Response) => {
  const { category, color } = req.body

  if (!category || !color) {
    return res.status(400).json({ error: 'category and color are required' })
  }

  // Validate hex color
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return res.status(400).json({ error: 'color must be a valid hex color (e.g. #3B82F6)' })
  }

  try {
    // Check instructor wing scope
    if (req.user!.role === 'instructor' && req.params.id !== req.user!.wing_id) {
      return res.status(403).json({ error: 'Instructors can only manage categories in their own wing' })
    }

    await pool.query(
      `INSERT INTO category_colors (wing_id, category, color)
       VALUES ($1, $2, $3)
       ON CONFLICT (wing_id, category)
       DO UPDATE SET color = $3`,
      [req.params.id, category, color]
    )
    res.json({ category, color })
  } catch (error) {
    console.error('Set category color error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/wings/:id/categories - create a new category for a wing
router.post('/:id/categories', authenticate, requireRole('instructor', 'admin'), async (req: AuthRequest, res: Response) => {
  const { category, color } = req.body

  if (!category || !category.trim()) {
    return res.status(400).json({ error: 'category name is required' })
  }

  if (!color) {
    return res.status(400).json({ error: 'color is required' })
  }

  // Validate hex color
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return res.status(400).json({ error: 'color must be a valid hex color (e.g. #3B82F6)' })
  }

  try {
    // Check instructor wing scope
    if (req.user!.role === 'instructor' && req.params.id !== req.user!.wing_id) {
      return res.status(403).json({ error: 'Instructors can only manage categories in their own wing' })
    }

    // Get the next sort_order
    const maxResult = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM category_colors WHERE wing_id = $1',
      [req.params.id]
    )
    const nextOrder = maxResult.rows[0].next_order

    // Insert the category
    const result = await pool.query(
      `INSERT INTO category_colors (wing_id, category, color, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING category, color, sort_order`,
      [req.params.id, category.trim(), color, nextOrder]
    )

    res.status(201).json(result.rows[0])
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A category with this name already exists for this wing' })
    }
    console.error('Create category error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/wings/:id/categories/reorder - reorder categories for a wing
router.put('/:id/categories/reorder', authenticate, requireRole('instructor', 'admin'), async (req: AuthRequest, res: Response) => {
  const { categoryOrder } = req.body

  if (!categoryOrder || !Array.isArray(categoryOrder) || categoryOrder.length === 0) {
    return res.status(400).json({ error: 'categoryOrder array is required' })
  }

  try {
    // Check instructor wing scope
    if (req.user!.role === 'instructor' && req.params.id !== req.user!.wing_id) {
      return res.status(403).json({ error: 'Instructors can only manage categories in their own wing' })
    }

    // Update or insert sort_order for each category
    for (let i = 0; i < categoryOrder.length; i++) {
      const categoryName = categoryOrder[i]
      await pool.query(
        `INSERT INTO category_colors (wing_id, category, sort_order, color)
         VALUES ($1, $2, $3, '#3B82F6')
         ON CONFLICT (wing_id, category)
         DO UPDATE SET sort_order = $3`,
        [req.params.id, categoryName, i]
      )
    }

    res.json({ reordered: true })
  } catch (error) {
    console.error('Reorder categories error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/wings/:id/categories/:category - delete category color and sort order
router.delete('/:id/categories/:category', authenticate, requireRole('instructor', 'admin'), async (req: AuthRequest, res: Response) => {
  const { category } = req.params

  if (!category) {
    return res.status(400).json({ error: 'category is required' })
  }

  try {
    // Check instructor wing scope
    if (req.user!.role === 'instructor' && req.params.id !== req.user!.wing_id) {
      return res.status(403).json({ error: 'Instructors can only manage categories in their own wing' })
    }

    // Delete the category color entry (resets color to default and sort_order to 0)
    await pool.query(
      'DELETE FROM category_colors WHERE wing_id = $1 AND category = $2',
      [req.params.id, category]
    )

    res.json({ deleted: true })
  } catch (error) {
    console.error('Delete category error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/wings/:id/skills - add a skill to a wing
router.post('/:id/skills', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const { name, category, sort_order } = req.body

  if (!name || !category) {
    return res.status(400).json({ error: 'Skill name and category are required' })
  }

  try {
    // Verify wing exists
    const wingCheck = await pool.query('SELECT id FROM wings WHERE id = $1', [req.params.id])
    if (wingCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Wing not found' })
    }

    // Get max sort_order for this wing if not provided
    let order = sort_order
    if (order === undefined || order === null) {
      const maxResult = await pool.query(
        'SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM skills WHERE wing_id = $1',
        [req.params.id]
      )
      order = maxResult.rows[0].next_order
    }

    const result = await pool.query(
      'INSERT INTO skills (wing_id, name, category, sort_order) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.params.id, name.trim(), category.trim(), order]
    )

    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Add skill error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/wings/:id/skills/reorder - bulk reorder skills
// NOTE: This must be defined BEFORE /:id/skills/:skillId to avoid Express matching "reorder" as a skillId
router.put('/:id/skills/reorder', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const { skill_ids } = req.body

  if (!Array.isArray(skill_ids) || skill_ids.length === 0) {
    return res.status(400).json({ error: 'skill_ids must be a non-empty array of skill IDs in the desired order' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Verify all skills belong to this wing
    const check = await client.query(
      'SELECT id FROM skills WHERE wing_id = $1 AND id = ANY($2)',
      [req.params.id, skill_ids]
    )
    if (check.rows.length !== skill_ids.length) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Some skill IDs are invalid or do not belong to this wing' })
    }

    // Update sort_order for each skill
    for (let i = 0; i < skill_ids.length; i++) {
      await client.query(
        'UPDATE skills SET sort_order = $1 WHERE id = $2 AND wing_id = $3',
        [i + 1, skill_ids[i], req.params.id]
      )
    }

    await client.query('COMMIT')

    // Return updated skills
    const result = await client.query(
      'SELECT * FROM skills WHERE wing_id = $1 ORDER BY sort_order, name',
      [req.params.id]
    )

    res.json(result.rows)
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Reorder skills error:', error)
    res.status(500).json({ error: 'Internal server error' })
  } finally {
    client.release()
  }
})

// PUT /api/wings/:id/skills/:skillId - update a skill
router.put('/:id/skills/:skillId', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const { name, category, sort_order } = req.body

  try {
    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (name) { updates.push(`name = $${paramIndex++}`); values.push(name.trim()) }
    if (category) { updates.push(`category = $${paramIndex++}`); values.push(category.trim()) }
    if (sort_order !== undefined) { updates.push(`sort_order = $${paramIndex++}`); values.push(sort_order) }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    values.push(req.params.skillId)
    values.push(req.params.id)

    const result = await pool.query(
      `UPDATE skills SET ${updates.join(', ')} WHERE id = $${paramIndex++} AND wing_id = $${paramIndex} RETURNING *`,
      values
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Skill not found' })
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error('Update skill error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/wings/:id/skills/:skillId - delete a skill
router.delete('/:id/skills/:skillId', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'DELETE FROM skills WHERE id = $1 AND wing_id = $2 RETURNING id',
      [req.params.skillId, req.params.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Skill not found' })
    }

    res.json({ deleted: true })
  } catch (error) {
    console.error('Delete skill error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
