import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import authRoutes from './routes/auth'
import pilotsRoutes from './routes/pilots'
import skillsRoutes from './routes/skills'
import qualificationsRoutes from './routes/qualifications'
import adminRoutes from './routes/admin'
import wingsRoutes from './routes/wings'
import pool from './db/pool'

dotenv.config()

// Validate required environment variables before starting
const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET']
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`FATAL: Missing required environment variable: ${envVar}`)
    process.exit(1)
  }
}

const app = express()
const PORT = process.env.PORT || 3001

// Security middleware
app.use(helmet())
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json({ limit: '100kb' }))

// Rate limiting — strict on auth, general limit on everything else
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
})

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
})

// Routes
app.use('/api/auth', authLimiter, authRoutes)
app.use('/api/pilots', generalLimiter, pilotsRoutes)
app.use('/api/skills', generalLimiter, skillsRoutes)
app.use('/api/qualifications', generalLimiter, qualificationsRoutes)
app.use('/api/admin', generalLimiter, adminRoutes)
app.use('/api/wings', generalLimiter, wingsRoutes)

// Health check — verifies DB connectivity
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', db: 'connected' })
  } catch {
    res.status(503).json({ status: 'error', db: 'unreachable' })
  }
})

// Graceful shutdown
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down gracefully')
  server.close(() => {
    pool.end().then(() => process.exit(0))
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT received — shutting down gracefully')
  server.close(() => {
    pool.end().then(() => process.exit(0))
  })
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason)
})

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err)
  process.exit(1)
})
