import { env } from '../config/env.js'
import AppError from '../utils/AppError.js'

// 404 for unmatched routes.
export function notFound(req, res, next) {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`))
}

// Central error handler — normalizes Mongoose/JWT/Zod errors into clean JSON.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500
  let message = err.message || 'Something went wrong'
  let details = err.details

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    statusCode = 400
    message = `Invalid ${err.path}: ${err.value}`
  }
  // Mongoose duplicate key (e.g. email already exists)
  if (err.code === 11000) {
    statusCode = 409
    const field = Object.keys(err.keyValue || {})[0] || 'field'
    message = `That ${field} is already in use.`
  }
  // Mongoose validation
  if (err.name === 'ValidationError') {
    statusCode = 400
    message = 'Validation failed'
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }))
  }
  // JWT
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401
    message = 'Invalid token'
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401
    message = 'Session expired, please sign in again'
  }

  if (statusCode >= 500) console.error('🔥', err)

  // A stack trace names absolute server paths, the framework and its version,
  // and the internal call chain — a map of the system handed to whoever
  // triggered the error. It belongs in the logs, never in a response.
  //
  // Gated on "not obviously a developer machine" rather than on isProd alone:
  // NODE_ENV is one forgotten dashboard variable away from being unset, and on
  // the deployed service it WAS unset — so every 404 was publishing the
  // container's file layout. Defaulting to hiding means forgetting the
  // variable costs a little debugging convenience instead of leaking.
  const isLocal = process.env.NODE_ENV === 'development' || !process.env.RAILWAY_ENVIRONMENT

  res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { details } : {}),
    ...(!env.isProd && isLocal ? { stack: err.stack } : {}),
  })
}
