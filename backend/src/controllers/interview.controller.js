import mongoose from 'mongoose'
import Interview from '../models/Interview.js'
import Application from '../models/Application.js'
import User from '../models/User.js'
import Job from '../models/Job.js'
import AppError from '../utils/AppError.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { aiService } from '../services/aiService.js'
import { notify } from '../services/notify.js'
import { teamMemberIds, isTeammateOf } from '../utils/teamAccess.js'
import { cloudinaryEnabled, uploadBuffer } from '../config/cloudinary.js'

// Small in-memory cache of baseline photos (url -> base64), so we don't
// re-download a candidate's photo from Cloudinary for every frame.
const baselineCache = new Map()
async function getBaselineB64(photoUrl) {
  if (!photoUrl) return null
  if (baselineCache.has(photoUrl)) return baselineCache.get(photoUrl)
  try {
    const res = await fetch(photoUrl)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const b64 = buf.toString('base64')
    if (baselineCache.size > 200) baselineCache.clear() // keep it bounded
    baselineCache.set(photoUrl, b64)
    return b64
  } catch {
    return null
  }
}

// How often a webcam still is kept for the report. Frames arrive every few
// seconds; saving them all would be thousands of uploads for one interview and
// tells an employer nothing a handful doesn't. This is the timeline spacing.
const FACE_SHOT_INTERVAL_MS = 90 * 1000
// A hard ceiling regardless of length, so a very long interview cannot fill
// storage on its own. Reference and violation frames are exempt — those are
// evidence, not timeline.
const FACE_SHOT_MAX = 20

// Save one webcam still to Cloudinary and attach it to the interview.
//
// Failure here is always silent: a missing picture is worth far less than an
// interview interrupted because image storage had a bad minute.
async function saveFaceShot(interview, frameB64, { kind, order, matchScore, matched, faceCount, violationType = '' }) {
  if (!cloudinaryEnabled || interview.isPractice) return null
  try {
    const base64 = String(frameB64).includes(',') ? String(frameB64).split(',')[1] : String(frameB64)
    const uploaded = await uploadBuffer(Buffer.from(base64, 'base64'), {
      folder: 'intivrabot/faceshots',
      resource_type: 'image',
      // A face only has to be recognisable by a human reviewer, so this is far
      // smaller than the screen captures — which have to keep text legible.
      transformation: [{ width: 640, crop: 'limit', quality: 'auto:good' }],
    })
    const now = Date.now()
    const startedAt = interview.startedAt ? new Date(interview.startedAt).getTime() : now
    await Interview.updateOne(
      { _id: interview._id },
      {
        $push: {
          faceShots: {
            url: uploaded.secure_url,
            publicId: uploaded.public_id,
            order,
            atSeconds: Math.max(0, Math.round((now - startedAt) / 1000)),
            matchScore: matchScore ?? null,
            matched: matched ?? null,
            faceCount: faceCount ?? 0,
            kind,
            violationType,
            at: new Date(),
          },
        },
      }
    )
    return uploaded.secure_url
  } catch {
    return null
  }
}

const FALLBACK_Q = [
  'Tell us briefly about yourself and your background.',
  'Describe a challenging project you worked on and your role in it.',
  'How do you approach learning a new technology or tool?',
  'Tell us about a time you worked in a team to solve a problem.',
  'Why are you a good fit for this role?',
]

// ── Session integrity ───────────────────────────────────────────────────────
// An in-progress interview used to be resumable indefinitely, so a candidate
// could read a question, close the tab, look the answer up and come back to it
// — an open-book exam wearing an interview's clothes, and a way around the face
// and voice checks the rest of this file works hard on.
//
// Long enough to survive a dropped connection, a browser crash or a phone call;
// far too short to research an answer.
const GRACE_MS = 5 * 60 * 1000
// Per-question time budget when the employer has not set one. Generous for a
// spoken answer plus thinking time; jobs override it with minutesPerQuestion.
const SECONDS_PER_QUESTION = 240

// Has the candidate been gone longer than the grace period?
function isAbandoned(interview) {
  // Nothing can be abandoned before it begins. The record is created by
  // /start, but the interview itself only starts once the candidate clears the
  // pre-check — and that screen legitimately takes a while: granting camera and
  // microphone permission, testing levels, picking a screen to share, reading
  // the terms. A candidate who spent six minutes there, or who opened the page,
  // stepped away and came back to set up properly, was told they had "left
  // their interview" and had their one attempt closed at zero — for an
  // interview that had never asked them a single question.
  if (!interview.startedAt) return false

  const last = interview.lastSeenAt || interview.updatedAt || interview.createdAt
  return Date.now() - new Date(last).getTime() > GRACE_MS
}

// Has the interview run past its total budget? The clock starts when the
// candidate finishes the device pre-check, not when the record was created —
// otherwise time spent granting camera permissions is time taken off the
// interview.
function isTimedOut(interview) {
  if (!interview.timeLimitSeconds || !interview.startedAt) return false
  const started = new Date(interview.startedAt).getTime()
  return Date.now() - started > interview.timeLimitSeconds * 1000
}

// Seconds left before the interview closes itself, for the countdown. Before
// the pre-check is done this is the full budget: nothing has been used yet.
function secondsLeft(interview) {
  // null means "untimed", which the candidate's UI renders as an infinity
  // symbol. Only practice runs are genuinely untimed — a real interview
  // reaching here with no budget is one created before minutesPerQuestion
  // existed, and showing it as unlimited both misleads the candidate and
  // removes the deadline the employer set. Fall back to the standard budget.
  if (!interview.timeLimitSeconds) {
    if (interview.isPractice) return null
    return (interview.totalQuestions || 5) * SECONDS_PER_QUESTION
  }
  if (!interview.startedAt) return interview.timeLimitSeconds
  const started = new Date(interview.startedAt).getTime()
  const left = interview.timeLimitSeconds - Math.floor((Date.now() - started) / 1000)
  return Math.max(0, left)
}

// Used only if the AI service is unreachable (keeps the interview usable).
function fallbackScore(text = '') {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.min(100, Math.round((Math.min(words, 80) / 80) * 70) + 10)
}

// Practice topics the AI generates questions around. Kept server-side so the
// question context can't be spoofed from the client.
const PRACTICE_TOPICS = {
  'React Fundamentals': { skills: ['React', 'JSX', 'Hooks', 'Components', 'State'], questions: 6 },
  'JavaScript Deep Dive': { skills: ['JavaScript', 'Closures', 'Async/Await', 'Prototypes', 'ES6'], questions: 8 },
  'Behavioral / HR Round': { skills: ['Communication', 'Teamwork', 'Problem Solving', 'Leadership'], questions: 5 },
  'System Design Basics': { skills: ['System Design', 'Databases', 'Caching', 'APIs', 'Scalability'], questions: 6 },
  'General Practice': { skills: ['Communication', 'Problem Solving'], questions: 5 },
}

// The question/scoring prompts need a job to talk about. A practice run has
// none, so its topic stands in for one.
function jobContextFor(interview) {
  if (interview.isPractice) {
    const topic = interview.topic || 'General Practice'
    return {
      title: topic,
      skills: PRACTICE_TOPICS[topic]?.skills || PRACTICE_TOPICS['General Practice'].skills,
      passThreshold: 60,
    }
  }
  return interview.job
}

// Live status of the three AI services, shared by every /start-ish response
// path (fresh start, pre-existing resume, and the race-condition resume) so
// the frontend's live-verification UI and "Gemini live" badge never fall back
// to their default-off state just because a particular response branch forgot
// to include them — that silently turns off face/voice monitoring, not just
// the badge.
async function aiFlags() {
  const [status, faceStatus, voiceStatus] = await Promise.all([
    aiService.interviewStatus(),
    aiService.faceStatus(),
    aiService.voiceStatus(),
  ])
  return {
    geminiEnabled: Boolean(status?.geminiEnabled),
    faceEnabled: Boolean(faceStatus?.faceEnabled),
    voiceEnabled: Boolean(voiceStatus?.voiceEnabled),
  }
}

// The rules this interview runs under, sent alongside every start/resume so the
// candidate's UI enforces exactly what the server will.
function policyOf(interview) {
  return {
    policy: {
      allowTextAnswers: interview.allowTextAnswers !== false,
      requireScreenShare: interview.requireScreenShare === true,
    },
  }
}

// Conversation limits per question, so the interview always moves forward.
// No "tell me more" follow-ups: candidates heard them as extra questions that
// never counted. The only non-answers are asking for a repeat/clarification
// or reporting a problem, and those are capped so a question always ends.
const MAX_FOLLOW_UPS = 0
const MAX_ASIDES_PER_QUESTION = 2
const ASIDE_INTENTS = new Set(['clarification', 'issue'])

function previousQA(interview) {
  return interview.questions
    .filter((q) => q.answer)
    .map((q) => ({ question: q.text, answer: q.answer, score: q.score }))
}

// Where the employer's own questions sit in the running order: question 1 is
// always an AI warm-up, then the HR's questions verbatim, then AI questions
// fill whatever is left.
function hrQuestionAt(interview, number) {
  const list = interview.hrQuestions || []
  const idx = number - 2 // slot 2 -> first HR question
  return idx >= 0 && idx < list.length ? list[idx] : null
}

// What the AI is told about the person being interviewed, so questions land at
// their actual level instead of a generic default.
async function candidateContext(candidateId) {
  const user = await User.findById(candidateId)
    .select('profile.skills profile.resumeSkills profile.experienceYears profile.headline')
    .lean()
  const p = user?.profile || {}
  return {
    skills: [...new Set([...(p.skills || []), ...(p.resumeSkills || [])])].slice(0, 20),
    experienceYears: p.experienceYears ?? null,
    headline: p.headline || '',
  }
}

async function genQuestion(job, interview, number, candidate) {
  // An employer's question is asked exactly as written — never rephrased.
  const custom = hrQuestionAt(interview, number)
  if (custom) return { text: custom, source: 'hr' }

  const res = await aiService.interviewQuestion({
    jobTitle: job.title,
    jobSkills: job.skills,
    previousQA: previousQA(interview),
    number,
    total: interview.totalQuestions,
    language: interview.language,
    field: interview.field || job.field || '',
    candidate,
  })
  // Remember the detected field so the rest of the interview keeps one style.
  if (!interview.field && res?.field) interview.field = res.field
  // `res` is null when the AI service is unreachable or ran out of its retry
  // budget — the candidate still gets a question, but it's the generic bank,
  // not something Gemini generated. Surfaced separately so the frontend's
  // "Gemini live" badge can reflect what's actually happening per question.
  return {
    text: res?.question || FALLBACK_Q[(number - 1) % FALLBACK_Q.length],
    source: res?.question ? 'ai' : 'fallback',
  }
}

// POST /api/interviews/start
export const start = asyncHandler(async (req, res) => {
  const { applicationId, language } = req.body
  if (!mongoose.isValidObjectId(applicationId)) throw new AppError(400, 'Invalid application id')

  const application = await Application.findById(applicationId).populate('job')
  if (!application) throw new AppError(404, 'Application not found')
  if (String(application.candidate) !== String(req.user._id)) throw new AppError(403, 'Not your application')
  const job = application.job
  if (!job) throw new AppError(404, 'Job not found for this application')

  // Identity enrolment is required to sit a real interview.
  //
  // The pre-check screen blocks this too, but that is a courtesy, not the
  // control: this endpoint is reachable directly, and the whole point of the
  // rule is that it cannot be skipped by whoever is trying to skip it. Without
  // a photo and a voiceprint there is nothing to compare the candidate to, so
  // every identity check passes vacuously and the employer receives a report
  // that looks verified but proves nothing.
  //
  // Only enforced for real interviews — practice has no employer to mislead.
  const me = await User.findById(req.user._id).select('photoUrl +profile.voiceRef').lean()
  const missing = []
  if (!me?.photoUrl) missing.push('a profile photo')
  if (!me?.profile?.voiceRef?.length) missing.push('a voiceprint')
  if (missing.length) {
    throw new AppError(
      403,
      `This interview is verified against your profile, but you have not added ${missing.join(' or ')}. ` +
      'Add this from your profile page, then start the interview.'
    )
  }

  // Resume an in-progress interview instead of starting a duplicate — but only
  // if they are actually coming back to it, not returning hours later with the
  // question researched. Whichever way it ended, it is scored and closed, and
  // a fresh attempt is not offered: one interview per application.
  let interview = await Interview.findOne({ application: applicationId, status: 'in_progress' })
  if (interview) {
    const expired =
      isTimedOut(interview) ? 'timeout' : isAbandoned(interview) ? 'abandoned' : null
    if (expired) {
      await interview.populate('job')
      await closeInterview(interview, expired)
      throw new AppError(
        410,
        expired === 'timeout'
          ? 'Your interview ran out of time and has been submitted. Your report covers the questions you answered.'
          : 'You left your interview and it has been submitted. Your report covers the questions you answered.'
      )
    }

    // A genuine reconnect — count it so the employer can see how often it
    // happened, and refresh the clock.
    await Interview.updateOne(
      { _id: interview._id },
      { $set: { lastSeenAt: new Date() }, $inc: { resumeCount: 1 } }
    )
    return res.json({
      success: true,
      resumed: true,
      interview,
      currentQuestion: interview.questions[interview.currentIndex],
      secondsLeft: secondsLeft(interview),
      ...(await aiFlags()),
      ...policyOf(interview),
    })
  }

  // One interview per application: a completed one is not re-taken, however it
  // ended. Without this, closing an abandoned run would just hand the
  // candidate a fresh set of questions — the loophole this is meant to shut.
  const previous = await Interview.findOne({ application: applicationId, status: 'completed' })
  if (previous) {
    throw new AppError(409, 'You have already taken the interview for this application.')
  }

  // The employer's questions are snapshotted here and always fit: the
  // interview is lengthened if they don't fit in the configured count.
  const hrQuestions = (job.customQuestions || []).filter((q) => q?.trim()).slice(0, 10)
  const totalQuestions = Math.max(job.questionCount || 5, hrQuestions.length + 1)

  interview = new Interview({
    application: applicationId,
    candidate: req.user._id,
    job: job._id,
    // The employer sets the language on the job; it is not the candidate's to
    // pick, for the same reason the answer mode isn't — an interview conducted
    // in a language the employer can't review is not a usable assessment.
    language: job.language || language || 'English',
    totalQuestions,
    hrQuestions,
    field: job.field || '',
    // Snapshotted with the questions: the rules the candidate agreed to at the
    // pre-check must not change under them if the job is edited mid-interview.
    allowTextAnswers: job.allowTextAnswers !== false,
    requireScreenShare: job.requireScreenShare !== false,
    // Budget the whole run up front, so a job edited mid-interview can't
    // shorten a clock the candidate is already racing.
    timeLimitSeconds:
      totalQuestions * ((job.minutesPerQuestion || 0) * 60 || SECONDS_PER_QUESTION),
    lastSeenAt: new Date(),
    currentIndex: 0,
    questions: [],
  })
  const candidate = await candidateContext(req.user._id)
  const q1 = await genQuestion(job, interview, 1, candidate)
  interview.questions.push({ order: 1, text: q1.text, source: q1.source })
  try {
    await interview.save()
  } catch (err) {
    // Another concurrent /start call for the same application won the race
    // and already created the in-progress interview (unique index above) —
    // resume that one instead of erroring.
    if (err.code === 11000) {
      const existing = await Interview.findOne({ application: applicationId, status: 'in_progress' })
      if (existing) {
        return res.json({
          success: true,
          resumed: true,
          interview: existing,
          currentQuestion: existing.questions[existing.currentIndex],
          // Was missing on this path, unlike the other resumes: losing a race
          // to a concurrent /start left the candidate's clock reading
          // "unlimited" for the whole interview, while the server went on
          // enforcing the real deadline underneath.
          secondsLeft: secondsLeft(existing),
          ...(await aiFlags()),
          ...policyOf(existing),
        })
      }
    }
    throw err
  }

  res.status(201).json({
    success: true,
    interview,
    currentQuestion: interview.questions[0],
    // null for practice, which has no time limit to run out of.
    secondsLeft: secondsLeft(interview),
    ...(await aiFlags()),
    ...policyOf(interview),
  })
})

// POST /api/interviews/practice — start an unscored mock interview. No
// application, no job, never surfaced to HR or in the candidate's reports.
export const startPractice = asyncHandler(async (req, res) => {
  const { topic, language } = req.body
  const key = PRACTICE_TOPICS[topic] ? topic : 'General Practice'

  // One practice run at a time — resume rather than pile up abandoned ones.
  let interview = await Interview.findOne({
    candidate: req.user._id,
    isPractice: true,
    status: 'in_progress',
  })
  if (interview && interview.topic === key) {
    return res.json({
      success: true,
      resumed: true,
      interview,
      currentQuestion: interview.questions[interview.currentIndex],
      // Practice is genuinely untimed, so this is null here — sent anyway so
      // every start/resume response has the same shape and the UI never falls
      // back to a stale value from a previous interview.
      secondsLeft: secondsLeft(interview),
      ...(await aiFlags()),
      ...policyOf(interview),
    })
  }
  // Switching topic abandons the old run.
  if (interview) await Interview.deleteOne({ _id: interview._id })

  interview = new Interview({
    isPractice: true,
    topic: key,
    candidate: req.user._id,
    language: language || 'English',
    totalQuestions: PRACTICE_TOPICS[key].questions,
    // Practice has no employer to set a policy and nothing to verify against,
    // so it never gates on typing or screen sharing.
    allowTextAnswers: true,
    requireScreenShare: false,
    currentIndex: 0,
    questions: [],
  })
  const q1 = await genQuestion(jobContextFor(interview), interview, 1, await candidateContext(req.user._id))
  interview.questions.push({ order: 1, text: q1.text, source: q1.source })
  try {
    await interview.save()
  } catch (err) {
    // Another concurrent /practice call for this candidate won the race and
    // already created the in-progress practice interview — resume it.
    if (err.code === 11000) {
      const existing = await Interview.findOne({ candidate: req.user._id, isPractice: true, status: 'in_progress' })
      if (existing) {
        return res.json({
          success: true,
          resumed: true,
          interview: existing,
          currentQuestion: existing.questions[existing.currentIndex],
          // Was missing on this path, unlike the other resumes: losing a race
          // to a concurrent /start left the candidate's clock reading
          // "unlimited" for the whole interview, while the server went on
          // enforcing the real deadline underneath.
          secondsLeft: secondsLeft(existing),
          ...(await aiFlags()),
          ...policyOf(existing),
        })
      }
    }
    throw err
  }

  res.status(201).json({
    success: true,
    interview,
    currentQuestion: interview.questions[0],
    // null for practice, which has no time limit to run out of.
    secondsLeft: secondsLeft(interview),
    ...(await aiFlags()),
    ...policyOf(interview),
  })
})

// POST /api/interviews/:id/voice  — analyse one answer's audio (speaker + multi-voice)
export const voice = asyncHandler(async (req, res) => {
  // `passive` marks a clip taken by the background monitor rather than one the
  // candidate submitted as an answer. It is never allowed to define the
  // reference voiceprint: the monitor deliberately listens when the candidate
  // is NOT speaking, so enrolling from it could make a bystander's voice the
  // one every later answer is judged against.
  const { audio, sampleRate, passive } = req.body
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid interview id')
  if (!audio) throw new AppError(400, 'No audio provided')

  // `job` is populated because a violation detected here can terminate the
  // interview, and closeInterview needs the job to score and notify against.
  const interview = await Interview.findById(req.params.id)
    .select('+voiceRef +interviewerVoiceRef')
    .populate('job')
  if (!interview) throw new AppError(404, 'Interview not found')
  if (String(interview.candidate) !== String(req.user._id)) throw new AppError(403, 'Not your interview')
  if (interview.status === 'completed') throw new AppError(400, 'Interview already completed')

  // Prefer the account-level voiceprint enrolled from the Profile page: it
  // catches a stand-in on the very first answer. Fall back to this interview's
  // own first clip for candidates who never enrolled.
  const enrolled = await User.findById(interview.candidate).select('+profile.voiceRef').lean()
  const accountRef = enrolled?.profile?.voiceRef?.length ? enrolled.profile.voiceRef : null
  const ref = accountRef || (interview.voiceRef?.length ? interview.voiceRef : undefined)
  const interviewerRef = interview.interviewerVoiceRef?.length ? interview.interviewerVoiceRef : undefined
  const result = await aiService.voiceAnalyze(audio, sampleRate || 16000, ref, interviewerRef)
  if (!result?.ok) {
    return res.json({ success: true, ok: false, reason: result?.error || 'unavailable' })
  }

  const sample = {
    order: interview.currentIndex + 1,
    matchScore: result.match?.score ?? null,
    matched: result.match?.matched ?? null,
    multiVoice: Boolean(result.multiVoice),
    voiceCount: result.voiceCount ?? 1,
    multiDetail: result.multiDetail ?? null,
    duration: result.duration,
    // A clip too quiet, clipped or short to embed reliably is kept for the
    // record but never counted against the candidate - see voice._audio_quality.
    reliable: result.quality?.usable !== false,
    at: new Date(),
  }

  // The reference voiceprint is what every later answer is judged against, so
  // only a clean clip may define it. Enrolling from a noisy first answer used
  // to mis-score the whole interview.
  const enrollNow =
    !passive &&
    !interview.voiceRef?.length && Array.isArray(result.embedding) && result.enrollable !== false

  // Atomic append, for the same reason as the frame handler: these arrive
  // alongside the candidate's answer and a full save would race it.
  await Interview.updateOne(
    { _id: interview._id },
    {
      $push: { voiceSamples: sample },
      ...(enrollNow ? { $set: { voiceRef: result.embedding } } : {}),
    }
  )

  // Someone speaking while the candidate is not on camera is the classic
  // "person off to the side feeding them answers" — and it is invisible to
  // both checks on their own: the face check sees an empty chair, the voice
  // check hears one speaker. Only together do they mean anything.
  //
  // Judged on the frames captured while this clip was being recorded, and only
  // on frames the detector could actually read, so a dark room never implies a
  // hidden helper.
  let warning = null
  if (sample.reliable !== false && !interview.isPractice) {
    const clipStart = Date.now() - (result.duration || 0) * 1000
    const during = (interview.faceSamples || []).filter(
      (s) => s.reliable !== false && new Date(s.at).getTime() >= clipStart
    )
    // Require a couple of readings before concluding anything: one frame that
    // happened to catch them reaching for a glass of water proves nothing.
    if (during.length >= 2 && during.every((s) => s.faceCount === 0)) {
      const r = await recordViolation(interview, 'offscreen_voice', {
        order: interview.currentIndex + 1,
        extra: `speech recorded across ${during.length} frames with nobody in view`,
      })
      if (r.strike && !r.duplicate && !r.ignored) warning = r
    }
  }

  res.json({
    success: true,
    ok: true,
    match: result.match, // null for the first (reference) clip
    multiVoice: result.multiVoice,
    voiceCount: result.voiceCount,
    isReference: result.match == null,
    ...(warning ? { warning } : {}),
  })
})

// POST /api/interviews/:id/interviewer-voice — learn the interviewer's voice.
//
// The page records what its microphone hears while the interviewer is
// talking — which is the TTS voice through this candidate's own speaker and
// room. Its voiceprint lets the multi-voice check discard leakage of the
// interviewer instead of calling it a second person. Learned once.
export const interviewerVoice = asyncHandler(async (req, res) => {
  const { audio, sampleRate } = req.body
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid interview id')
  if (!audio) throw new AppError(400, 'No audio provided')
  const interview = await Interview.findById(req.params.id).select('candidate status +interviewerVoiceRef')
  if (!interview) throw new AppError(404, 'Interview not found')
  if (String(interview.candidate) !== String(req.user._id)) throw new AppError(403, 'Not your interview')
  if (interview.interviewerVoiceRef?.length) return res.json({ success: true, learned: true })

  const result = await aiService.voiceEmbed(audio, sampleRate || 16000)
  if (!result?.ok) return res.json({ success: true, learned: false, reason: result?.error || 'unavailable' })

  // Never learn the candidate's own voice as the interviewer's (they talked
  // over it): that would hide them from their own checks.
  const me = await User.findById(interview.candidate).select('+profile.voiceRef').lean()
  const ref = me?.profile?.voiceRef
  if (ref?.length === result.embedding.length) {
    const dot = ref.reduce((s, v, i) => s + v * result.embedding[i], 0)
    const norm = Math.hypot(...ref) * Math.hypot(...result.embedding)
    if (norm && dot / norm >= 0.6) return res.json({ success: true, learned: false, reason: 'candidate_voice' })
  }
  await Interview.updateOne({ _id: interview._id }, { $set: { interviewerVoiceRef: result.embedding } })
  res.json({ success: true, learned: true })
})

// POST /api/interviews/voice-check — verify the speaker BEFORE the interview.
//
// The pre-check used to pass on hearing any sound at all, so a candidate could
// hold a phone to the microphone, or have someone else say "testing one two
// three", and the check went green. It confirmed a working microphone and
// nothing about who was sitting there.
//
// This compares the clip against the voiceprint they enrolled on their profile,
// which is the only thing that makes the check mean anything. Deliberately not
// tied to an interview id: at this point no interview has started.
export const voiceCheck = asyncHandler(async (req, res) => {
  const { audio, sampleRate } = req.body
  if (!audio) throw new AppError(400, 'No audio provided')

  const user = await User.findById(req.user._id).select('+profile.voiceRef').lean()
  const ref = user?.profile?.voiceRef?.length ? user.profile.voiceRef : null

  // Nothing to compare against. The candidate is not at fault — they simply
  // never enrolled — so the microphone still passes on hearing them, and the
  // response says why verification was skipped rather than claiming a match.
  if (!ref) {
    const result = await aiService.voiceAnalyze(audio, sampleRate || 16000, undefined)
    return res.json({
      success: true,
      ok: Boolean(result?.ok),
      enrolled: false,
      heard: Boolean(result?.ok),
      reason: 'not_enrolled',
    })
  }

  const result = await aiService.voiceAnalyze(audio, sampleRate || 16000, ref)
  if (!result?.ok) {
    // Two very different failures used to look identical here, and the caller
    // passed the candidate on both. They are separated so the page can retry
    // the one that is the candidate's to fix and only wave through our own
    // outage:
    //
    //   'too_short' etc. — the CLIP was unusable. Retryable; must not pass, or
    //   anyone can satisfy the check with a cough.
    //   anything else    — the SERVICE failed. Not the candidate's problem.
    const err = result?.error || 'unavailable'
    const clipProblem = ['too_short', 'too_quiet', 'clipped', 'unusable'].includes(err)
    return res.json({
      success: true,
      ok: !clipProblem ? false : true,
      enrolled: true,
      // A clip problem is reported as a usable:false result rather than a
      // service failure, which is what it actually is.
      ...(clipProblem ? { usable: false, matched: null, score: null } : {}),
      reason: err,
    })
  }

  // A clip too quiet, clipped or short to embed cannot be judged either way.
  const usable = result.quality?.usable !== false

  res.json({
    success: true,
    ok: true,
    enrolled: true,
    usable,
    matched: usable ? (result.match?.matched ?? null) : null,
    score: result.match?.score ?? null,
    multiVoice: Boolean(result.multiVoice),
  })
})

// POST /api/interviews/face-check — verify the face BEFORE the interview.
//
// The camera card used to go green on the camera merely turning on, exactly as
// the microphone card used to pass on hearing any sound. A photo held to the
// lens, or somebody else sitting down, passed it. This matches the frame
// against the photo on the candidate's profile — the same comparison the
// interview itself runs on every frame, just moved to where the candidate can
// still fix it.
//
// Like voice-check, deliberately not tied to an interview id: no interview
// exists yet.
export const faceCheck = asyncHandler(async (req, res) => {
  const { frame: frameB64 } = req.body
  if (!frameB64) throw new AppError(400, 'No frame provided')

  const user = await User.findById(req.user._id).select('photoUrl').lean()
  const baseline = await getBaselineB64(user?.photoUrl)

  // No profile photo to compare against. Not the candidate's fault, so the
  // camera still passes and the response says why verification was skipped
  // rather than claiming a match it never made.
  if (!baseline) {
    const result = await aiService.faceAnalyze(frameB64, null)
    return res.json({
      success: true,
      ok: Boolean(result?.ok),
      enrolled: false,
      faceCount: result?.faceCount ?? null,
      reason: 'no_photo',
    })
  }

  const result = await aiService.faceAnalyze(frameB64, baseline)
  if (!result?.ok) {
    // The face service being down must never lock a candidate out of their own
    // interview — same fail-open rule as voice-check.
    return res.json({ success: true, ok: false, enrolled: true, reason: 'unavailable' })
  }

  // A frame too dark, blurred or small to judge cannot prove a *mismatch* —
  // see face._frame_quality — so a poor frame never accuses anybody.
  //
  // But it can still prove a match. A webcam frame is routinely dimmer or
  // softer than the posed photo it is compared against, so on quality alone
  // the honest candidate's frame is often marked unusable; suppressing a clear
  // match there meant the person who genuinely IS themselves got "we couldn't
  // confirm it" while the check quietly did nothing. A high score is not
  // ambiguous whatever the lighting — a dark frame makes scores fall, not rise.
  const usable = result.quality?.usable !== false
  const score = result.match?.score ?? null
  const matched = usable
    ? (result.match?.matched ?? null)
    : (score != null && result.match?.matched === true ? true : null)

  res.json({
    success: true,
    ok: true,
    enrolled: true,
    // Only report the frame as unjudgeable when it actually withheld a verdict.
    usable: usable || matched === true,
    faceCount: result.faceCount ?? null,
    singlePerson: result.singlePerson !== false,
    matched,
    score,
    qualityIssues: result.quality?.issues || [],
  })
})

// POST /api/interviews/:id/frame  — analyse one webcam frame (face + emotion)
export const frame = asyncHandler(async (req, res) => {
  const { frame: frameB64 } = req.body
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid interview id')
  if (!frameB64) throw new AppError(400, 'No frame provided')

  const interview = await Interview.findById(req.params.id)
  if (!interview) throw new AppError(404, 'Interview not found')
  if (String(interview.candidate) !== String(req.user._id)) throw new AppError(403, 'Not your interview')
  if (interview.status === 'completed') throw new AppError(400, 'Interview already completed')

  const candidate = await User.findById(interview.candidate).select('photoUrl')
  const baseline = await getBaselineB64(candidate?.photoUrl)

  const result = await aiService.faceAnalyze(frameB64, baseline)
  if (!result?.ok) {
    return res.json({ success: true, ok: false, faceEnabled: Boolean(result) })
  }

  const sample = {
    order: interview.currentIndex + 1,
    faceCount: result.faceCount,
    singlePerson: result.singlePerson,
    confidence: result.emotion?.confidence,
    stress: result.emotion?.stress,
    label: result.emotion?.label,
    certainty: result.emotion?.certainty ?? null,
    matchScore: result.match?.score ?? null,
    matched: result.match?.matched ?? null,
    // A frame the camera could not capture properly must not later be read
    // as evidence about the candidate - see face._frame_quality.
    reliable: result.quality?.usable !== false,
    at: new Date(),
  }
  // Append atomically instead of interview.save(). Frames now arrive every few
  // seconds, so a full-document save would race the answer the candidate is
  // submitting at the same moment and one of the two would fail a version
  // check. $push touches only this array and never bumps __v.
  // Frames arrive every few seconds while the candidate is actually at the
  // interview, which makes this the natural heartbeat for the away-too-long
  // check — no separate ping needed.
  await Interview.updateOne(
    { _id: interview._id },
    { $push: { faceSamples: sample }, $set: { lastSeenAt: new Date() } }
  )

  // Keep the picture, not only the numbers. Which frames are worth keeping:
  //
  //  1. The FIRST clear frame — the reference. This is the single most useful
  //     image in the report: it shows who actually sat down to the interview.
  //  2. Every so often after that, for a timeline.
  //
  // Note this deliberately does NOT gate on `sample.reliable`. That flag says
  // the frame is too poor to *measure* against a baseline, which is a much
  // higher bar than being worth looking at: an ordinary webcam frame is
  // routinely softer than the posed photo it is compared against and comes
  // back "blurry", so gating on it meant most real interviews saved no
  // reference picture at all — the one image the report most needs. A human
  // reviewer can recognise a face in a frame the matcher won't score.
  //
  // Only a frame too dark to make anything out is skipped, and the match
  // numbers shown alongside each still still come from the measurement, so a
  // soft frame never turns into a confident-looking score.
  const shots = interview.faceShots || []
  const tooDark = (result.quality?.issues || []).includes('too_dark')
  if (!tooDark && result.faceCount > 0) {
    const hasReference = shots.some((s) => s.kind === 'reference')
    const lastAt = shots.length ? new Date(shots[shots.length - 1].at).getTime() : 0
    const due = Date.now() - lastAt > FACE_SHOT_INTERVAL_MS
    const room = shots.filter((s) => s.kind === 'periodic').length < FACE_SHOT_MAX

    if (!hasReference || (due && room)) {
      await saveFaceShot(interview, frameB64, {
        kind: hasReference ? 'periodic' : 'reference',
        order: sample.order,
        matchScore: sample.matchScore,
        matched: sample.matched,
        faceCount: result.faceCount,
      })
    }
  }

  res.json({
    success: true,
    ok: true,
    faceCount: result.faceCount,
    singlePerson: result.singlePerson,
    emotion: result.emotion,
    match: result.match,
    quality: result.quality,
    baselineAvailable: Boolean(baseline),
  })
})

// POST /api/interviews/:id/answer
//
// Despite the name this handles everything the candidate says, not just
// answers. What they said is classified first: a real answer is scored and
// moves the interview on, while a question, a problem or a request to repeat
// gets a spoken reply and leaves the current question standing. That is what
// makes this feel like a conversation rather than a form — and it stops a
// candidate being scored zero for saying "sorry, could you repeat that?".
export const answer = asyncHandler(async (req, res) => {
  const { answer: answerText, mode, reason, hardship } = req.body
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid interview id')

  const interview = await Interview.findById(req.params.id).populate('job')
  if (!interview) throw new AppError(404, 'Interview not found')
  if (String(interview.candidate) !== String(req.user._id)) throw new AppError(403, 'Not your interview')
  // Closed under the candidate (a violation from another request, timeout…).
  // 410 + the reason lets the page show the right ending instead of an error.
  if (interview.status === 'completed') {
    throw new AppError(410, 'This interview has already ended.', {
      endedReason: interview.endedReason || 'completed',
      terminatedFor: interview.terminatedFor || '',
    })
  }

  // The gate that actually matters. Checked here as well as on /start because
  // /start is not the only way back in: a tab left open overnight still holds a
  // live interview id, and without this it could post an answer researched at
  // leisure. Practice runs are exempt — there is nothing to game.
  if (!interview.isPractice) {
    const expired =
      isTimedOut(interview) ? 'timeout' : isAbandoned(interview) ? 'abandoned' : null
    if (expired) {
      await closeInterview(interview, expired)
      throw new AppError(
        410,
        expired === 'timeout'
          ? 'Your interview ran out of time and has been submitted.'
          : 'You were away too long, so your interview has been submitted.'
      )
    }
  }

  const job = jobContextFor(interview)
  const idx = interview.currentIndex
  const q = interview.questions[idx]
  if (!q) throw new AppError(400, 'No active question to answer')

  // Typing is the employer's decision, enforced here and not only in the UI —
  // a candidate could otherwise just post mode:'text' straight to the API and
  // bypass the voice biometrics entirely. A hardship request is the one way
  // through, and it is recorded on the answer for the report.
  const usingText = (mode || 'text') === 'text'
  const textAllowed = interview.allowTextAnswers !== false
  const viaHardship = Boolean(hardship) && !textAllowed
  if (usingText && !textAllowed && !viaHardship) {
    throw new AppError(400, 'This employer requires spoken answers for this interview.')
  }

  const candidate = await candidateContext(interview.candidate)

  // ── Is this actually an answer? ──────────────────────────────────────────
  // Voice mode only. A typed answer is a deliberate act with a Submit button
  // behind it, so there is nothing to disambiguate; sending it through the
  // classifier would just add a round-trip and risk mis-reading a terse answer
  // as chatter. Candidates ask their questions through the Ask control, which
  // posts to /converse directly.
  const talk = usingText
    ? { intent: 'answer', complete: true, reply: '', answer: answerText }
    : (await aiService.interviewConverse({
        utterance: answerText,
        question: q.text,
        jobTitle: job.title,
        jobSkills: job.skills,
        previousQA: previousQA(interview),
        turns: (interview.turns || []).slice(-6).map((t) => ({
          role: t.role, text: t.text, intent: t.intent,
        })),
        language: interview.language,
        field: interview.field || job.field || '',
        candidate,
      })) || { intent: 'answer', complete: true, reply: '', answer: answerText }

  // Either not an answer at all, or an answer that isn't finished yet. Both
  // get a spoken reply and leave the question standing — an interviewer who
  // asks a follow-up hasn't moved on, so nothing is scored and no question is
  // consumed. The partial answer is kept as a turn so the follow-up has it in
  // context and the candidate isn't made to repeat themselves.
  // One follow-up per question at most. Without a cap the model kept calling
  // every answer "incomplete" and asked for more detail forever, so the
  // interview never got past question 1.
  const extensions = (interview.turns || []).filter(
    (t) => t.role === 'candidate' && t.order === q.order && t.intent === 'answer_extension'
  )
  const unfinished =
    talk.intent === 'answer' && talk.complete === false && Boolean(talk.reply) &&
    extensions.length < MAX_FOLLOW_UPS
  const asides = (interview.turns || []).filter((t) => t.role === 'candidate' && t.order === q.order)
  // Once the interviewer has asked a follow-up, whatever comes next IS the
  // answer to it. The classifier sometimes read that reply as a question, so
  // one question took three turns and felt like several uncounted questions.
  const afterFollowUp = extensions.length > 0
  if (
    (ASIDE_INTENTS.has(talk.intent) && !afterFollowUp && asides.length < MAX_ASIDES_PER_QUESTION) ||
    unfinished
  ) {
    const now = new Date()
    await Interview.updateOne(
      { _id: interview._id },
      {
        $push: {
          turns: {
            $each: [
              {
                role: 'candidate',
                text: answerText,
                intent: unfinished ? 'answer_extension' : talk.intent,
                order: q.order,
                at: now,
              },
              { role: 'ai', text: talk.reply, intent: '', order: q.order, at: now },
            ],
          },
        },
        $set: { lastSeenAt: now },
      }
    )
    return res.json({
      success: true,
      conversational: true,
      intent: talk.intent,
      // A follow-up on a half-finished answer, rather than a reply to an
      // aside. The UI keeps what they already said instead of clearing it.
      followUp: unfinished,
      reply: talk.reply,
      currentQuestion: q, // unchanged — they still owe us this answer
      done: false,
    })
  }

  // They answered. If they also slipped a question in, the AI's aside is kept
  // as a turn so it can be spoken alongside the next question.
  // Score the whole answer: what they said before the follow-up plus this part.
  const scorable = [...extensions.map((t) => t.text), (talk.answer || answerText).trim() || answerText]
    .join(' ')
    .trim()

  // Record the answer before either AI call, so the question generator can see
  // it in previousQA and ask a genuine follow-up.
  q.answer = scorable
  q.mode = mode || 'text'
  if (reason) q.reason = reason
  if (viaHardship) q.hardship = true
  q.answeredAt = new Date()

  const answeredCount = idx + 1
  const done = answeredCount >= interview.totalQuestions

  // Score this answer and write the next question at the same time. They were
  // sequential, which made the candidate wait for both round-trips - about
  // 16 seconds between pressing Next and seeing anything. Neither call needs
  // the other's result: scoring reads the answer, generation reads the
  // transcript, so running them together costs the slower one alone.
  const [scored, next] = await Promise.all([
    aiService.interviewScore({
      question: q.text,
      answer: scorable,
      jobTitle: job.title,
      jobSkills: job.skills,
      language: interview.language,
      field: interview.field || job.field || '',
      candidate,
    }),
    done ? Promise.resolve(null) : genQuestion(job, interview, answeredCount + 1, candidate),
  ])

  q.score = scored?.score ?? fallbackScore(scorable)
  q.feedback = scored?.feedback || ''
  q.strengths = scored?.strengths || []
  q.improvements = scored?.improvements || []

  let nextQuestion = null
  if (next) {
    interview.currentIndex = idx + 1
    interview.questions.push({ order: answeredCount + 1, text: next.text, source: next.source })
    nextQuestion = interview.questions[interview.currentIndex]
  }

  // Write only the fields this request owns. Scoring an answer takes several
  // seconds, during which the monitoring loop appends face and voice samples;
  // a full interview.save() here would write back the stale in-memory copy
  // loaded before that and silently drop every sample captured meanwhile.
  await Interview.updateOne(
    { _id: interview._id },
    {
      $set: {
        questions: interview.questions,
        currentIndex: interview.currentIndex,
        // Answering is proof of life too — the face check may be off, or the
        // camera may have been denied, and neither should time them out.
        lastSeenAt: new Date(),
      },
    }
  )

  res.json({
    success: true,
    reply: '',
    // Scores are for the employer's report, not shown live to the candidate.
    nextQuestion,
    done,
    progress: { answered: answeredCount, total: interview.totalQuestions },
  })
})

// POST /api/interviews/:id/ask
//
// The candidate deliberately says something to the interviewer that is not an
// answer — a question about the role, or a problem they've hit. Separate from
// /answer so raising your hand can never be mistaken for an attempt to answer
// and scored, which is the thing candidates would reasonably be afraid of.
export const ask = asyncHandler(async (req, res) => {
  const { text } = req.body
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid interview id')

  const interview = await Interview.findById(req.params.id).populate('job')
  if (!interview) throw new AppError(404, 'Interview not found')
  if (String(interview.candidate) !== String(req.user._id)) throw new AppError(403, 'Not your interview')
  if (interview.status === 'completed') throw new AppError(400, 'Interview already completed')

  const job = jobContextFor(interview)
  const q = interview.questions[interview.currentIndex]
  const candidate = await candidateContext(interview.candidate)

  const talk = await aiService.interviewConverse({
    utterance: text,
    question: q?.text || '',
    jobTitle: job.title,
    jobSkills: job.skills,
    previousQA: previousQA(interview),
    turns: (interview.turns || []).slice(-6).map((t) => ({
      role: t.role, text: t.text, intent: t.intent,
    })),
    language: interview.language,
    field: interview.field || job.field || '',
    candidate,
  })

  // The candidate chose "ask", so this is never scored even if the classifier
  // read it as an answer — treat that reading as "they expanded on something"
  // rather than silently turning their aside into a graded response.
  const intent = !talk || talk.intent === 'answer' ? 'answer_extension' : talk.intent
  const reply =
    talk?.reply ||
    "Thanks — I've noted that. Let's continue when you're ready."

  const now = new Date()
  await Interview.updateOne(
    { _id: interview._id },
    {
      $push: {
        turns: {
          $each: [
            { role: 'candidate', text, intent, order: q?.order, at: now },
            { role: 'ai', text: reply, intent: '', order: q?.order, at: now },
          ],
        },
      },
    }
  )

  res.json({ success: true, intent, reply })
})

// POST /api/interviews/:id/begin — the candidate cleared the pre-check.
//
// This is what starts the clock. Doing it here rather than at /start means the
// time spent granting camera permissions and reading the instructions is not
// charged to the interview.
export const begin = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid interview id')

  const interview = await Interview.findById(req.params.id)
  if (!interview) throw new AppError(404, 'Interview not found')
  if (String(interview.candidate) !== String(req.user._id)) throw new AppError(403, 'Not your interview')
  if (interview.status === 'completed') throw new AppError(400, 'Interview already completed')

  const now = new Date()
  // Only ever set once: coming back to a resumed interview must not hand the
  // candidate a fresh clock.
  if (!interview.startedAt) {
    await Interview.updateOne(
      { _id: interview._id },
      { $set: { startedAt: now, lastSeenAt: now } }
    )
    interview.startedAt = now
  } else {
    await Interview.updateOne({ _id: interview._id }, { $set: { lastSeenAt: now } })
  }

  res.json({ success: true, secondsLeft: secondsLeft(interview) })
})

// POST /api/interviews/:id/screen — record a screen-share state change.
export const screen = asyncHandler(async (req, res) => {
  const { type, surface, gapSeconds } = req.body
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid interview id')

  const interview = await Interview.findById(req.params.id).select('candidate status requireScreenShare')
  if (!interview) throw new AppError(404, 'Interview not found')
  if (String(interview.candidate) !== String(req.user._id)) throw new AppError(403, 'Not your interview')
  if (interview.status === 'completed') throw new AppError(400, 'Interview already completed')

  // Stopping the share mid-interview is the event worth flagging; starting it
  // again is just the candidate fixing the problem.
  const flagged = interview.requireScreenShare && (type === 'stopped' || type === 'wrong_surface')

  await Interview.updateOne(
    { _id: interview._id },
    {
      $push: { screenEvents: { type, surface: surface || '', at: new Date() } },
      $inc: {
        ...(flagged ? { screenFlags: 1 } : {}),
        ...(Number(gapSeconds) > 0 ? { screenGapSeconds: Math.round(Number(gapSeconds)) } : {}),
      },
    }
  )

  res.json({ success: true })
})

// ── Proctoring: one warning, then the interview ends ────────────────────────
//
// What each rule means, in the words the candidate is warned with and the
// employer reads in the report. Written once, here, so the two can never
// disagree — a candidate told "someone else was in frame" and an employer told
// "identity flag" would be reading about the same event and not know it.
const VIOLATION_DETAIL = {
  multiple_faces: 'Another person was visible on camera during the interview.',
  no_face: 'The candidate was not visible on camera for a sustained period.',
  face_mismatch: 'The person on camera did not match the candidate’s profile photo.',
  multiple_voices: 'Another voice was heard speaking during an answer.',
  voice_mismatch: 'The voice answering did not match the candidate’s enrolled voice.',
  screen_share: 'The required screen share was stopped during the interview.',
  tab_switch: 'The candidate left the interview page during the interview.',
  // Phase 7 — what the camera and the shared screen actually showed.
  phone_detected: 'A phone or tablet was visible on camera during the interview.',
  notes_detected: 'Notes, printed sheets or an open book were visible on camera.',
  screen_detected: 'A second screen or laptop was visible on camera.',
  spoofed_camera: 'The camera appeared to show a photo, a screen or a synthetic face rather than a live person.',
  gaze_away: 'The candidate spent a sustained period looking away from the screen, consistent with reading something off-camera.',
  offscreen_voice: 'A voice was heard while the candidate was not visible on camera.',
  screen_cheating: 'The shared screen showed an AI assistant, search results or prepared notes during the interview.',
}

// Detections are noisy, and the same problem persisting is not a new offence:
// someone sitting in the background produces a hit every few seconds, and
// counting each one would terminate an honest candidate in half a minute. One
// strike per rule per this window, so a second strike means it happened, was
// warned about, and then happened again.
const VIOLATION_COOLDOWN_MS = 45 * 1000

// Record a broken rule and decide what it costs.
//
// Shared by the client-reported route below and by the server-side vision
// checks, which detect their own violations and must apply exactly the same
// two-strike rule — a phone spotted by Gemini has to cost what a second face
// spotted by the browser costs, or the policy the candidate agreed to isn't
// the policy being enforced.
//
// `extra` carries the evidence behind a vision detection (what was seen, and
// how sure the model was) so the report can show why, not just what.
async function recordViolation(interview, type, { order, extra = '' } = {}) {
  // Practice is for rehearsing. Ending someone's practice run for looking away
  // teaches them nothing and costs them the session they came to get.
  if (interview.isPractice) return { ignored: true, strike: 0, terminated: false }
  if (interview.status === 'completed') return { ignored: true, strike: 0, terminated: false }

  const now = Date.now()
  const existing = interview.violations || []
  const lastOfType = [...existing].reverse().find((v) => v.type === type)
  if (lastOfType && now - new Date(lastOfType.at).getTime() < VIOLATION_COOLDOWN_MS) {
    // Still the same incident — already warned for, not a fresh offence.
    return { duplicate: true, strike: existing.length, terminated: false }
  }

  // Strikes are counted across every rule, not per rule. Someone who is warned
  // for a second face and then stops sharing their screen has been warned once
  // and done it again — the specific rule differing doesn't make it a first
  // offence.
  const strike = existing.length + 1
  const terminated = strike >= 2
  const base = VIOLATION_DETAIL[type]
  // The evidence is appended to the same sentence rather than kept in a
  // separate field, so anywhere the detail is shown it carries its own proof.
  const detail = extra ? `${base} (${extra})` : base
  const startedAt = interview.startedAt ? new Date(interview.startedAt).getTime() : now

  const record = {
    type,
    strike,
    detail,
    atSeconds: Math.max(0, Math.round((now - startedAt) / 1000)),
    order: order || interview.currentIndex + 1,
    at: new Date(),
  }

  interview.violations = [...existing, record]
  await Interview.updateOne(
    { _id: interview._id },
    { $push: { violations: record }, $set: { lastSeenAt: new Date() } }
  )

  if (terminated) {
    interview.terminatedFor = detail
    await closeInterview(interview, 'violation')
    return {
      strike,
      terminated: true,
      detail,
      message:
        'Your interview has been ended. ' +
        detail +
        ' You were warned once already, and the employer has been sent a report explaining this.',
    }
  }

  return {
    strike,
    terminated: false,
    detail,
    message:
      'Warning: ' + detail +
      ' This is your only warning — if it happens again your interview will end automatically.',
  }
}

// POST /api/interviews/:id/violation
//
// The candidate's page reports a rule it detected being broken. The server
// decides what it costs — never the client, which is the thing being policed:
// the strike count and the decision to end the interview are computed here from
// what is already stored, so suppressing the call can only lose a candidate the
// warning they would have been given, never earn them a pass.
export const violation = asyncHandler(async (req, res) => {
  const { type, order, frame: frameB64 } = req.body
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid interview id')
  if (!VIOLATION_DETAIL[type]) throw new AppError(400, 'Unknown violation type')

  const interview = await Interview.findById(req.params.id).populate('job')
  if (!interview) throw new AppError(404, 'Interview not found')
  if (String(interview.candidate) !== String(req.user._id)) throw new AppError(403, 'Not your interview')
  if (interview.status === 'completed') throw new AppError(400, 'Interview already completed')

  const result = await recordViolation(interview, type, { order })

  // Keep the frame behind the strike when the page sent one. Optional because
  // several rules here are not visual at all — a stopped screen share or a
  // switched tab has no picture to take — and because a strike must stand on
  // the server's own decision whether or not an image came with it.
  if (frameB64 && result.strike && !result.duplicate && !result.ignored) {
    await saveFaceShot(interview, frameB64, {
      kind: 'violation',
      order: order ?? interview.currentIndex + 1,
      violationType: type,
    })
  }

  res.json({ success: true, ...result })
})

// Gaze is a coarse signal, so it is judged over a window rather than per
// frame: a glance at the keyboard is normal, and only a sustained pattern of
// looking away reads as reading something off-camera.
const GAZE_MIN_SAMPLES = 12          // don't judge before there is enough to judge
const GAZE_AWAY_RATIO = 0.55         // more than half the interview looking away

// POST /api/interviews/:id/proctor — deeper checks on one webcam frame.
//
// Separate from /frame on purpose. /frame runs every few seconds on local ONNX
// models and is essentially free; the vision checks here cost a Gemini call
// each, so they run on a much slower cadence and the client says which it
// wants. Both feed the same two-strike rule.
export const proctorFrame = asyncHandler(async (req, res) => {
  const { frame: frameB64, checks } = req.body
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid interview id')
  if (!frameB64) throw new AppError(400, 'No frame provided')

  const interview = await Interview.findById(req.params.id).populate('job')
  if (!interview) throw new AppError(404, 'Interview not found')
  if (String(interview.candidate) !== String(req.user._id)) throw new AppError(403, 'Not your interview')
  if (interview.status === 'completed') throw new AppError(400, 'Interview already completed')

  const wanted = Array.isArray(checks) && checks.length ? checks : ['gaze']
  // The candidate's learned neutral head position, carried across calls
  // because the AI service holds no state of its own.
  const baseCount = interview.gazeBaselineCount || 0
  const baseline = baseCount ? (interview.gazeBaselineSum || 0) / baseCount : null
  const result = await aiService.proctorFrame(frameB64, wanted, baseline, baseCount)
  if (!result) return res.json({ success: true, ok: false, reason: 'unavailable' })

  const order = interview.currentIndex + 1
  let warning = null
  // At most one violation per call. Two rules breaking in the same frame is
  // one moment, not two offences — raising both would take a candidate from
  // clean to terminated without ever showing them a warning.
  const raise = async (type, extra) => {
    if (warning) return
    const r = await recordViolation(interview, type, { order, extra })
    if (r.strike && !r.duplicate && !r.ignored) {
      warning = r
      // Keep the frame that caused it. A strike described in words alone asks
      // the employer to take the detection on trust and leaves the candidate
      // nothing to contest — this is the actual evidence, saved at the moment
      // it mattered rather than reconstructed afterwards.
      await saveFaceShot(interview, frameB64, {
        kind: 'violation',
        order,
        violationType: type,
      })
    }
  }

  // ── Gaze (local, free) ──
  const g = result.gaze
  if (g?.ok) {
    const away = g.lookingAway ? 1 : 0
    // Only forward-facing frames feed the baseline (the service returns null
    // otherwise), or a candidate who spent the first minute reading their notes
    // would calibrate "looking down" as their own normal.
    const sample = g.baselineSample
    await Interview.updateOne(
      { _id: interview._id },
      {
        $inc: {
          gazeTotalFrames: 1,
          gazeAwayFrames: away,
          ...(sample != null ? { gazeBaselineSum: sample, gazeBaselineCount: 1 } : {}),
        },
        $set: { lastSeenAt: new Date() },
      }
    )
    const total = (interview.gazeTotalFrames || 0) + 1
    const awayTotal = (interview.gazeAwayFrames || 0) + away
    // Nothing is judged until the baseline has settled — before that "down"
    // is never reported, so the ratio would be measuring left/right alone.
    if (g.baselineReady && total >= GAZE_MIN_SAMPLES && awayTotal / total >= GAZE_AWAY_RATIO) {
      await raise(
        'gaze_away',
        `looking away in ${Math.round((awayTotal / total) * 100)}% of samples`
      )
    }
  }

  // ── Objects in shot (vision) ──
  // One violation type per object kind, so the report names what was seen.
  const objectType = {
    phone: 'phone_detected',
    notes: 'notes_detected',
    screen: 'screen_detected',
    person: 'multiple_faces',
  }
  for (const obj of result.objects?.actionable || []) {
    await raise(objectType[obj.type], `${obj.note || obj.type}, ${obj.confidence}% confidence`)
  }

  // ── Liveness (vision) ──
  if (result.liveness?.spoofed) {
    await raise(
      'spoofed_camera',
      `${result.liveness.reason || 'spoof indicators'}, ${result.liveness.confidence}% confidence`
    )
  }

  res.json({
    success: true,
    ok: true,
    gaze: result.gaze || null,
    objects: result.objects?.actionable || [],
    liveness: result.liveness || null,
    ...(warning ? { warning } : {}),
  })
})

// POST /api/interviews/:id/screenshot — store one capture of the shared screen.
//
// The image goes to Cloudinary and only its URL is kept on the interview: a
// base64 screenshot every half-minute would push a long interview past Mongo's
// 16MB document limit. Analysis is opt-in per shot because each one is a
// Gemini call — the client captures often and analyses rarely.
export const screenshot = asyncHandler(async (req, res) => {
  const { shot, analyze } = req.body
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid interview id')
  if (!shot) throw new AppError(400, 'No screenshot provided')

  const interview = await Interview.findById(req.params.id).populate('job')
  if (!interview) throw new AppError(404, 'Interview not found')
  if (String(interview.candidate) !== String(req.user._id)) throw new AppError(403, 'Not your interview')
  if (interview.status === 'completed') throw new AppError(400, 'Interview already completed')
  // Nothing to review and nobody to review it — a practice run has no employer.
  if (interview.isPractice) return res.json({ success: true, skipped: true })

  const now = Date.now()
  const startedAt = interview.startedAt ? new Date(interview.startedAt).getTime() : now
  const order = interview.currentIndex + 1
  const atSeconds = Math.max(0, Math.round((now - startedAt) / 1000))

  // Analyse before uploading: if the shot shows cheating, that matters even
  // when storage is unavailable or the upload fails.
  let findings = []
  let analyzed = false
  if (analyze) {
    const vision = await aiService.proctorScreen(shot)
    if (vision?.ok) {
      analyzed = true
      findings = vision.actionable || []
    }
  }

  let url = ''
  let publicId = ''
  if (cloudinaryEnabled) {
    try {
      const base64 = String(shot).includes(',') ? String(shot).split(',')[1] : String(shot)
      const uploaded = await uploadBuffer(Buffer.from(base64, 'base64'), {
        folder: 'intivrabot/screenshots',
        resource_type: 'image',
        // Screens are wide and full of small text; this keeps the text legible
        // for a reviewer while holding a long interview's storage in check.
        transformation: [{ width: 1280, crop: 'limit', quality: 'auto:good' }],
      })
      url = uploaded.secure_url
      publicId = uploaded.public_id
    } catch {
      // Storage failing must never end an interview — the finding above is
      // still recorded, just without the picture behind it.
    }
  }

  if (url) {
    await Interview.updateOne(
      { _id: interview._id },
      {
        $push: { screenshots: { url, publicId, order, atSeconds, analyzed, findings, at: new Date() } },
        $set: { lastSeenAt: new Date() },
      }
    )
  }

  let warning = null
  if (findings.length) {
    const worst = findings.reduce((a, b) => (b.confidence > a.confidence ? b : a))
    const r = await recordViolation(interview, 'screen_cheating', {
      order,
      extra: `${worst.note || worst.type}, ${worst.confidence}% confidence`,
    })
    if (r.strike && !r.duplicate && !r.ignored) warning = r
  }

  res.json({ success: true, stored: Boolean(url), findings, ...(warning ? { warning } : {}) })
})

// POST /api/interviews/:id/finish
export const finish = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid interview id')
  const interview = await Interview.findById(req.params.id).populate('job')
  if (!interview) throw new AppError(404, 'Interview not found')
  if (String(interview.candidate) !== String(req.user._id)) throw new AppError(403, 'Not your interview')
  if (interview.status === 'completed') {
    return res.json({ success: true, interview, alreadyCompleted: true })
  }

  const result = await closeInterview(interview, 'completed')
  res.json({ success: true, ...result })
})

// Score and close an interview, however it ended. Shared by the candidate
// finishing normally and by the abandon/timeout paths, so a walked-away
// interview is marked up exactly like a finished one — unanswered questions
// count as zero either way, and the employer still gets a report.
async function closeInterview(interview, reason = 'completed') {
  const job = jobContextFor(interview)
  const qa = interview.questions
    .filter((q) => q.answer)
    .map((q) => ({ question: q.text, answer: q.answer, score: q.score, strengths: q.strengths, improvements: q.improvements }))

  const summary = await aiService.interviewSummary({
    jobTitle: job.title,
    qa,
    passThreshold: job.passThreshold,
    // The side conversation shapes the engagement note, never the score.
    turns: (interview.turns || []).map((t) => ({
      role: t.role, text: t.text, intent: t.intent,
    })),
  })

  // Every question asked counts, answered or not. Averaging only the scored
  // ones let someone answer one question well and skip the rest for a high
  // mark — an unanswered question is a zero, not an absence.
  const scores = interview.questions
    .filter((q) => q.text)
    .map((q) => (q.score != null ? q.score : 0))
  // Always our own average, never the summary's. The AI summary only sees the
  // questions that were answered, so taking its number back would restore the
  // very loophole the zero-fill above closes.
  const overall = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0

  // Aggregate face + emotion samples (Phase 5).
  //
  // Frames now arrive every few seconds rather than once per question, so a
  // single bad frame is normal: someone walks past, the candidate looks away,
  // a cloud passes. Counting every one of those as a flag would fail almost
  // everybody. Two rules keep this fair:
  //   1. Unreliable frames (too dark / blurred / distant) are excluded, since
  //      they say more about the webcam than the candidate.
  //   2. What matters is how *often* something is wrong, not that it ever was.
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null)
  const allSamples = interview.faceSamples || []
  const samples = allSamples.filter((s) => s.reliable !== false)

  // Weight each emotion reading by how sure the model was about it.
  const emotionReadings = samples.filter((s) => s.confidence != null)
  const emotionScore = emotionReadings.length
    ? Math.round(
        emotionReadings.reduce((sum, s) => sum + s.confidence * ((s.certainty ?? 100) / 100), 0) /
          emotionReadings.reduce((sum, s) => sum + (s.certainty ?? 100) / 100, 0)
      )
    : null

  const faceMatchScore = avg(samples.map((s) => s.matchScore).filter((v) => v != null))

  // A flag is raised on a sustained problem, not a stray frame.
  const FLAG_RATIO = 0.25 // a quarter of the interview
  const ratio = (predicate) => {
    if (!samples.length) return 0
    return samples.filter(predicate).length / samples.length
  }
  const notAloneRatio = ratio((s) => !s.singlePerson)
  const mismatchRatio = ratio((s) => s.matched === false)

  let faceFlags = 0
  if (notAloneRatio >= FLAG_RATIO) faceFlags += 1
  if (mismatchRatio >= FLAG_RATIO) faceFlags += 1

  // Voice biometrics aggregate (Phase 6). Same reasoning as above.
  const allVoice = interview.voiceSamples || []
  const vSamples = allVoice.filter((s) => s.reliable !== false)
  const voiceMatchScore = avg(vSamples.map((s) => s.matchScore).filter((v) => v != null))
  const voiceFlags = vSamples.filter((s) => s.multiVoice || s.matched === false).length

  // Engagement is reported, never scored — see the turns schema.
  const askedTurns = (interview.turns || []).filter(
    (t) => t.role === 'candidate' && t.intent === 'question'
  )
  const issueTurns = (interview.turns || []).filter(
    (t) => t.role === 'candidate' && t.intent === 'issue'
  )

  interview.status = 'completed'
  interview.endedReason = reason
  // Set by the violation handler before it closes the interview; carried onto
  // the saved document so the report can lead with the reason.
  if (reason === 'violation' && !interview.terminatedFor) {
    const last = (interview.violations || [])[interview.violations.length - 1]
    interview.terminatedFor = last?.detail || 'A verification rule was broken during the interview.'
  }
  interview.overallScore = overall
  interview.engagement = {
    questionsAsked: summary?.engagement?.questionsAsked ?? askedTurns.length,
    issuesReported: summary?.engagement?.issuesReported ?? issueTurns.length,
    note: summary?.engagement?.note || '',
  }
  interview.verdict = summary?.verdict || ''
  interview.strengths = summary?.strengths || []
  interview.improvements = summary?.improvements || []
  interview.emotionScore = emotionScore
  interview.faceMatchScore = faceMatchScore
  interview.faceFlags = faceFlags
  interview.voiceMatchScore = voiceMatchScore
  interview.voiceFlags = voiceFlags
  interview.completedAt = new Date()
  await interview.save()

  // A practice run stops here: no application to update, and nothing is sent
  // to HR. The candidate still gets their score and feedback in the response.
  if (interview.isPractice) {
    return { interview, practice: true }
  }

  // Reflect the outcome on the application.
  const application = await Application.findById(interview.application)
  let totalFlags = faceFlags + voiceFlags
  if (application) {
    application.interviewScore = overall
    application.emotionScore = emotionScore
    // Flag text-mode answers plus any face/voice/identity anomalies for HR.
    const textAnswers = interview.questions.filter((q) => q.mode === 'text' && q.answer).length
    // Screen-share interruptions on a job that required it, and any answer
    // typed under a hardship exception the employer had not sanctioned.
    const screenFlags = interview.screenFlags || 0
    const hardshipAnswers = interview.questions.filter((q) => q.hardship).length
    // An interview that was walked away from is itself worth an employer's
    // attention, however the remaining questions happened to score.
    const abandonFlag = reason === 'completed' ? 0 : 1
    // Each warned rule-break is a flag in its own right. Without this an
    // interview ended for cheating could still show a low flag count, because
    // a candidate caught early never got far enough to accumulate face samples.
    const violationFlags = (interview.violations || []).length
    totalFlags =
      faceFlags + voiceFlags + textAnswers + screenFlags + hardshipAnswers +
      abandonFlag + violationFlags
    application.flags = totalFlags
    // An interview ended for a rule-break is not a pass, whatever the answers
    // given before it scored — the score is no longer evidence of anything.
    application.status =
      reason === 'violation' ? 'rejected'
        : overall >= job.passThreshold ? 'passed'
        : 'rejected'
    await application.save()
  }

  // Realtime notifications: candidate gets their report, HR gets the completion.
  const ended =
    reason === 'abandoned' ? 'was ended after they left'
    : reason === 'timeout' ? 'ran out of time'
    : reason === 'violation' ? 'was ended for a verification rule-break'
    : 'finished'
  const cand = await User.findById(interview.candidate).select('name')
  notify(interview.candidate, {
    type: 'interview',
    title:
      reason === 'completed'
        ? 'Your interview report is ready'
        : 'Your interview was closed',
    body:
      reason === 'completed'
        ? `You scored ${overall}% on ${job.title}.`
        : reason === 'violation'
          ? `Your ${job.title} interview was ended. ${interview.terminatedFor} The report explains this to the employer.`
          : `Your ${job.title} interview ${ended}. You scored ${overall}% on what you answered.`,
    link: `/candidate/results?id=${interview._id}`,
  })
  notify(job.hr, {
    type: 'interview',
    title: 'Candidate completed an interview',
    body: `${cand?.name || 'A candidate'}'s ${job.title} interview ${ended} — ${overall}%.`,
    link: `/hr/report/${interview.application}`,
  })
  if (totalFlags > 0) {
    notify(job.hr, {
      type: 'flag',
      title: 'Verification flags raised',
      body: `${cand?.name || 'A candidate'}'s interview has ${totalFlags} flag${totalFlags === 1 ? '' : 's'} to review.`,
      link: `/hr/report/${interview.application}`,
    })
  }

  return { interview }
}

// GET /api/interviews/mine  — the candidate's own interview reports (newest first)
export const myInterviews = asyncHandler(async (req, res) => {
  // Practice runs are deliberately excluded — they are not real reports.
  const interviews = await Interview.find({ candidate: req.user._id, isPractice: { $ne: true } })
    .populate('job', 'title company passThreshold')
    .select('job application status overallScore emotionScore faceMatchScore voiceMatchScore faceFlags voiceFlags totalQuestions completedAt createdAt')
    .sort({ completedAt: -1, createdAt: -1 })
    .lean()

  res.json({ success: true, interviews })
})

// GET /api/interviews/hr/schedule  — interview activity across the HR team's jobs
export const hrSchedule = asyncHandler(async (req, res) => {
  const teamIds = await teamMemberIds(req.user)
  const jobs = await Job.find({ hr: { $in: teamIds } }).select('_id').lean()
  const jobIds = jobs.map((j) => j._id)

  const interviews = await Interview.find({ job: { $in: jobIds } })
    .populate('candidate', 'name')
    .populate('job', 'title')
    .sort({ updatedAt: -1 })
    .limit(50)
    .lean()

  const list = interviews.map((iv) => ({
    id: iv._id,
    application: iv.application,
    candidate: iv.candidate?.name || 'Candidate',
    role: iv.job?.title,
    status: iv.status, // in_progress | completed
    overallScore: iv.overallScore,
    startedAt: iv.createdAt,
    completedAt: iv.completedAt,
  }))

  // Count interviews per day for the current week (Mon–Sun).
  const now = new Date()
  const monday = new Date(now)
  const dow = (now.getDay() + 6) % 7 // 0 = Monday
  monday.setDate(now.getDate() - dow)
  monday.setHours(0, 0, 0, 0)
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return { date: d.getDate(), day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i], count: 0 }
  })
  interviews.forEach((iv) => {
    const t = new Date(iv.completedAt || iv.createdAt)
    const diff = Math.floor((t - monday) / 86400000)
    if (diff >= 0 && diff < 7) week[diff].count++
  })

  res.json({
    success: true,
    week,
    inProgress: list.filter((x) => x.status === 'in_progress'),
    recent: list.filter((x) => x.status === 'completed').slice(0, 8),
  })
})

// GET /api/interviews/:id  (candidate owner, or HR who owns the job)
export const getInterview = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid interview id')
  const interview = await Interview.findById(req.params.id).populate('job', 'title hr passThreshold')
  if (!interview) throw new AppError(404, 'Interview not found')

  const isOwnerCandidate = String(interview.candidate) === String(req.user._id)
  const isOwnerHr = req.user.role === 'hr' && interview.job?.hr && (await isTeammateOf(req.user, interview.job.hr))
  if (!isOwnerCandidate && !isOwnerHr) throw new AppError(403, 'Forbidden')

  res.json({ success: true, interview })
})
