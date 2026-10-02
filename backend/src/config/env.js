import dotenv from 'dotenv'
dotenv.config()

// Fail fast if a required variable is missing — clearer than a runtime crash later.
const required = ['MONGODB_URI', 'JWT_SECRET']

const missing = required.filter((k) => !process.env[k])
if (missing.length) {
  console.error(`❌ Missing required env vars: ${missing.join(', ')}`)
  console.error('   Copy .env.example → .env and fill them in.')
  process.exit(1)
}

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  clientUrls: (process.env.CLIENT_URLS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  aiServiceUrl: process.env.AI_SERVICE_URL || '',
  // Shared secret proving a request to the AI service came from this backend.
  // That service is publicly reachable and holds the Gemini/Groq keys, so
  // without it anyone can spend the quota. Optional: unset means the AI
  // service skips the check too, which keeps local dev working.
  aiServiceKey: process.env.AI_SERVICE_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  cloudinaryUrl: process.env.CLOUDINARY_URL || '',

  // Outgoing mail (password resets). Optional: with no credentials the app
  // falls back to returning the reset link in the API response, so the flow
  // still works locally without an email provider configured.
  mail: {
    user: process.env.MAIL_USER || '',
    pass: process.env.MAIL_PASS || '',
    from: process.env.MAIL_FROM || process.env.MAIL_USER || '',
    // Gmail is the default because an App Password is the quickest free setup,
    // but any SMTP host works by overriding these two.
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.MAIL_PORT) || 465,
  },
}

// True once both credentials are present — the only check the mailer needs.
export const mailEnabled = Boolean(env.mail.user && env.mail.pass)
