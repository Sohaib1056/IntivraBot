import { env } from '../config/env.js'

// Thin HTTP client for the Python AI service. Every call is best-effort:
// if the AI service is down, callers get null and the app degrades gracefully
// (e.g. an application is still created, just unscored).

// Gemini calls (question generation, scoring, and especially the end-of-interview
// summary) can take ~20s on a cold call, so keep a generous timeout — otherwise
// the finish step silently loses the verdict/strengths and falls back to averages.
// The Python side enforces its own _TOTAL_BUDGET (28s, see ai-services/app/core/gemini.py)
// across every retry and fallback model combined, so this just needs margin above
// that plus network/process overhead — it should never be the one to cut Gemini off.
const TIMEOUT_MS = 35000

// Proves to the AI service that a call came from this backend. That service
// holds the Gemini/Groq keys and runs the vision and voice models behind a
// public domain, where CORS protects nothing against a direct request — see
// the require_service_key middleware in ai-services/app/main.py. Omitted when
// unset so existing deployments keep working until both sides are configured.
const serviceHeaders = () =>
  env.aiServiceKey ? { 'X-Service-Key': env.aiServiceKey } : {}

async function post(path, body) {
  if (!env.aiServiceUrl) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${env.aiServiceUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...serviceHeaders() },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      console.warn(`AI service ${path} -> ${res.status}`)
      return null
    }
    return await res.json()
  } catch (err) {
    console.warn(`AI service ${path} unreachable:`, err.message)
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function get(path) {
  if (!env.aiServiceUrl) return null
  try {
    const res = await fetch(`${env.aiServiceUrl}${path}`, { headers: serviceHeaders() })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export const aiService = {
  isConfigured: () => Boolean(env.aiServiceUrl),

  // Real Gemini status from the AI service ({ geminiEnabled }).
  interviewStatus: () => get('/api/interview/status'),

  // Returns { score, matchedSkills, missingSkills, ... } or null.
  matchResume: (resumeText, jobSkills, jobExperience = '', extra = {}) =>
    post('/api/match', {
      resumeText,
      jobSkills,
      jobExperience,
      profileSkills: extra.profileSkills || [],
      experienceYears: extra.experienceYears ?? null,
    }),

  // Score one resume against many jobs at once. Returns { results: [...] } or
  // null — used by the candidate job board, which scores a whole page.
  matchResumeBatch: (resumeText, jobs, extra = {}) =>
    post('/api/match-batch', {
      resumeText,
      jobs,
      profileSkills: extra.profileSkills || [],
      experienceYears: extra.experienceYears ?? null,
    }),

  // Returns { skills, experienceYears, education } or null.
  parseResume: (text) => post('/api/parse-resume', { text }),

  // Extract raw text from an uploaded resume file. Returns { text, charCount } or null.
  extractResumeText: async (buffer, filename) => {
    if (!env.aiServiceUrl) return null
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const form = new FormData()
      form.append('file', new Blob([buffer]), filename || 'resume')
      const res = await fetch(`${env.aiServiceUrl}/api/extract-text`, {
        method: 'POST',
        // No Content-Type here — fetch sets the multipart boundary itself.
        headers: serviceHeaders(),
        body: form,
        signal: controller.signal,
      })
      if (!res.ok) {
        console.warn(`AI service /api/extract-text -> ${res.status}`)
        return null
      }
      return await res.json()
    } catch (err) {
      console.warn('AI service /api/extract-text unreachable:', err.message)
      return null
    } finally {
      clearTimeout(timer)
    }
  },

  // ── Interview (Phase 4) ──
  // Returns { question, field } or null.
  interviewQuestion: (payload) => post('/api/interview/question', payload),
  // Which field a role falls into ({ field, label }) — used when posting a job.
  detectField: (jobTitle, jobSkills) =>
    post('/api/interview/detect-field', { jobTitle, jobSkills }),
  // Returns { score, feedback, strengths, improvements } or null.
  interviewScore: (payload) => post('/api/interview/score', payload),
  // What the candidate just said: { intent, reply, answer } or null. Lets the
  // interview run as a conversation instead of a fixed question form.
  interviewConverse: (payload) => post('/api/interview/converse', payload),
  // Returns { overallScore, verdict, strengths, improvements } or null.
  interviewSummary: (payload) => post('/api/interview/summary', payload),

  // ── Face + Emotion (Phase 5) ──
  // Whether the face/emotion models are loaded ({ faceEnabled }).
  faceStatus: () => get('/api/face/status'),
  // Analyse one frame vs an optional baseline. Returns the analysis or null.
  faceAnalyze: (frame, baseline) => post('/api/face/analyze', { frame, baseline }),

  // ── Voice biometrics (Phase 6) ──
  // Whether the speaker model (Resemblyzer) is available ({ voiceEnabled }).
  voiceStatus: () => get('/api/voice/status'),
  // Analyse one answer's audio (Int16 PCM base64) vs an optional reference embedding.
  voiceAnalyze: (audio, sampleRate, reference, interviewer) =>
    post('/api/voice/analyze', { audio, sampleRate, reference, interviewer }),
  voiceEmbed: (audio, sampleRate) => post('/api/voice/embed', { audio, sampleRate }),

  // ── Visual proctoring (Phase 7) ──
  // Which checks are actually available ({ gazeEnabled, visionEnabled, checks }).
  proctorStatus: () => get('/api/proctor/status'),
  // Run gaze / object / liveness checks over one webcam frame. `checks` picks
  // which, because each vision check is a separate Gemini call.
  // `gazeBaseline`/`gazeSamples` carry the candidate's learned resting head
  // position across calls — the AI service is stateless.
  proctorFrame: (frame, checks, gazeBaseline = null, gazeSamples = 0) =>
    post('/api/proctor/frame', { frame, checks, gazeBaseline, gazeSamples }),
  // Inspect a shared-screen screenshot for AI chats, search results or notes.
  proctorScreen: (shot) => post('/api/proctor/screen', { shot }),
}
