import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'

import { env } from './config/env.js'
import { corsOrigin } from './config/cors.js'
import routes from './routes/index.js'
import { notFound, errorHandler } from './middleware/error.js'

const app = express()

// Behind Railway's proxy, every request arrives from the proxy's own address.
// Without this, req.ip is that single address for ALL traffic, so the rate
// limiters below bucket every user together: one noisy client exhausts the
// window for everybody, and a brute-force attempt is indistinguishable from
// normal load. Trusting one hop makes req.ip the real client again.
//
// Exactly one hop, not `true` — trusting the whole chain would let a client
// forge X-Forwarded-For and hand itself a fresh rate-limit bucket per request.
app.set('trust proxy', 1)

// Security & parsing
app.use(helmet())
app.use(express.json({ limit: '8mb' })) // room for base64 webcam frames + audio clips
app.use(express.urlencoded({ extended: true }))

// CORS — configured frontend origins (plus any localhost port in dev)
app.use(cors({ origin: corsOrigin, credentials: true }))

if (!env.isProd) app.use(morgan('dev'))

// Basic global rate limit (auth routes get a stricter one of their own)
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please slow down.' },
  })
)

// Health check (used by Railway + uptime monitors)
app.get('/health', (req, res) =>
  res.json({ status: 'ok', service: 'intivrabot-backend', time: new Date().toISOString() })
)

// API routes
app.use('/api', routes)

// 404 + error handling (must be last)
app.use(notFound)
app.use(errorHandler)

export default app
