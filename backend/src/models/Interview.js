import mongoose from 'mongoose'

const { Schema, model } = mongoose

const questionSchema = new Schema(
  {
    order: { type: Number, required: true },
    text: { type: String, required: true },
    // 'hr' = written by the employer on the job post, 'ai' = Gemini-generated,
    // 'fallback' = the AI service was unreachable/out of budget, so this came
    // from the generic offline question bank instead.
    source: { type: String, enum: ['ai', 'hr', 'fallback'], default: 'ai' },
    answer: { type: String, default: '' },
    mode: { type: String, enum: ['voice', 'text'], default: 'text' },
    reason: { type: String }, // why text mode was used (flagged in report)
    // True when this answer was typed under a hardship exception on a job whose
    // employer had disabled text answers. Flagged harder in the report than an
    // ordinary typed answer, because the employer did not sanction it up front.
    hardship: { type: Boolean, default: false },
    score: { type: Number, min: 0, max: 100, default: null },
    feedback: { type: String, default: '' },
    strengths: { type: [String], default: [] },
    improvements: { type: [String], default: [] },
    answeredAt: { type: Date },
  },
  { _id: false }
)

// Everything said during the interview that is not a scored answer: the
// candidate asking a question, raising a problem, or the AI replying. These are
// kept out of `questions` on purpose — they are conversation, not assessment,
// and must never be averaged into the score. HR sees them in the report as
// context on how the candidate engaged.
const turnSchema = new Schema(
  {
    // 'candidate' = something the candidate said off-answer, 'ai' = the reply.
    role: { type: String, enum: ['candidate', 'ai'], required: true },
    text: { type: String, required: true, maxlength: 4000 },
    // What the candidate's turn was: a genuine question about the role/process,
    // a technical problem they hit, or small talk. Classified by the AI so the
    // report can separate "asked 3 thoughtful questions" from "reported a bug".
    intent: {
      type: String,
      enum: ['question', 'issue', 'clarification', 'smalltalk', 'answer_extension', ''],
      default: '',
    },
    // Which interview question was on screen when this was said.
    order: { type: Number },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
)

// A screen-share session or interruption. The employer requires a full-screen
// share; every gap in it is recorded here rather than silently tolerated.
const screenEventSchema = new Schema(
  {
    type: { type: String, enum: ['started', 'stopped', 'wrong_surface'], required: true },
    // 'monitor' | 'window' | 'browser' — only 'monitor' satisfies the requirement.
    surface: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
)

// One face/emotion sample captured from a webcam frame during the interview.
const faceSampleSchema = new Schema(
  {
    order: { type: Number }, // question the frame was taken during
    faceCount: { type: Number, default: 0 },
    singlePerson: { type: Boolean, default: false },
    confidence: { type: Number, min: 0, max: 100 }, // composure/positivity
    stress: { type: Number, min: 0, max: 100 },
    label: { type: String }, // dominant emotion
    certainty: { type: Number, min: 0, max: 100, default: null }, // how firmly the model committed
    matchScore: { type: Number, min: 0, max: 100, default: null }, // vs baseline photo
    matched: { type: Boolean, default: null },
    // False when the frame was too dark, blurred or distant to judge. Scoring
    // and flagging both skip these, so a bad webcam never costs a candidate.
    reliable: { type: Boolean, default: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
)

// One voice sample analysed from an answer's audio (Phase 6).
const voiceSampleSchema = new Schema(
  {
    order: { type: Number },
    matchScore: { type: Number, min: 0, max: 100, default: null }, // vs reference voiceprint
    matched: { type: Boolean, default: null },
    multiVoice: { type: Boolean, default: false }, // more than one speaker heard
    voiceCount: { type: Number, default: 1 },
    // Why the multi-voice check decided as it did (other-voice windows,
    // separation from the candidate) — kept so a disputed flag can be audited.
    multiDetail: { type: Schema.Types.Mixed, default: null },
    duration: { type: Number },
    // As above: a clip that was too quiet, clipped or too short to embed
    // reliably is recorded but never flagged.
    reliable: { type: Boolean, default: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
)

// A proctoring rule the candidate broke, and what was done about it.
//
// The point of recording these individually rather than as a counter is the
// report: an employer told only "2 violations" learns nothing, and a candidate
// whose interview was ended deserves to know exactly which rule, and when. Each
// one carries its own evidence so neither has to take the number on trust.
const violationSchema = new Schema(
  {
    // What was detected. Kept coarse on purpose — these are the things a human
    // reviewer would actually act on, not every noisy signal.
    type: {
      type: String,
      enum: [
        'multiple_faces',   // someone else in frame
        'no_face',          // candidate left the camera's view
        'face_mismatch',    // the person on camera is not the candidate
        'multiple_voices',  // another person heard speaking
        'voice_mismatch',   // the voice is not the candidate's
        'screen_share',     // required share stopped or was the wrong surface
        'tab_switch',       // left the interview page
        // ── Phase 7: what the camera and the shared screen actually show ──
        'phone_detected',   // a phone or tablet in shot
        'notes_detected',   // notes, printed sheets or an open book in shot
        'screen_detected',  // a second monitor or laptop visible to the camera
        'spoofed_camera',   // a photo, a screen, or a deepfake instead of a person
        'gaze_away',        // sustained reading off to one side or down
        'offscreen_voice',  // someone speaking while the candidate is not in frame
        'screen_cheating',  // an AI chat, search results or notes on the shared screen
      ],
      required: true,
    },
    // 1 = warned, 2 = interview ended. Mirrors what the candidate was shown, so
    // the report can never disagree with what actually happened on screen.
    strike: { type: Number, default: 1 },
    // Plain-language explanation, written once here and reused verbatim by the
    // candidate's warning and the employer's report.
    detail: { type: String, default: '' },
    // Seconds into the interview, so the employer can place it in the
    // transcript rather than guessing from a wall-clock timestamp.
    atSeconds: { type: Number, default: 0 },
    order: { type: Number }, // question on screen at the time
    at: { type: Date, default: Date.now },
  },
  { _id: false }
)

// One periodic capture of the candidate's shared screen.
//
// The image itself lives in Cloudinary, not here — a base64 screenshot every
// half-minute would bloat the document past Mongo's 16MB limit on a long
// interview. What is stored is the URL plus whatever the vision check made of
// it, so HR's report can show the timeline without re-analysing anything.
const screenshotSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: '' }, // for deletion when the record goes
    order: { type: Number },                 // question on screen at the time
    atSeconds: { type: Number, default: 0 }, // seconds into the interview
    // What the vision check found, if it ran. Empty means "nothing of concern"
    // — distinct from `analyzed: false`, which means it was never looked at.
    analyzed: { type: Boolean, default: false },
    findings: {
      type: [
        {
          _id: false,
          type: { type: String },
          confidence: { type: Number },
          note: { type: String },
        },
      ],
      default: [],
    },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
)

// One saved webcam still of the candidate during the interview.
//
// The face checks already ran on every frame, but only the *numbers* survived —
// a match score with no picture behind it. An employer reading "identity match
// 41%" had no way to see who was actually sitting there, and a candidate
// accused of it had nothing to point at. These are the frames themselves.
//
// Same storage rule as screenshotSchema: the image goes to Cloudinary and only
// the URL is kept here, or a long interview would blow the 16MB document limit.
const faceShotSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: '' }, // for deletion when the record goes
    order: { type: Number },                 // question on screen at the time
    atSeconds: { type: Number, default: 0 },
    // The identity verdict for this exact frame, so a flagged still can be
    // shown next to the reason it was flagged instead of an overall average.
    matchScore: { type: Number, min: 0, max: 100, default: null },
    matched: { type: Boolean, default: null },
    faceCount: { type: Number, default: 0 },
    // Why this frame was kept. 'reference' is the first good frame — proof of
    // who started the interview. 'violation' is the frame that triggered a
    // strike, which is the one an employer most needs to see. 'periodic' is the
    // ordinary timeline.
    kind: {
      type: String,
      enum: ['reference', 'periodic', 'violation'],
      default: 'periodic',
    },
    // Set when kind === 'violation', naming the rule this frame evidences.
    violationType: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
)

const interviewSchema = new Schema(
  {
    // Practice runs have no application or job behind them — they are started
    // straight from the Practice page and never reach HR.
    isPractice: { type: Boolean, default: false, index: true },
    topic: { type: String, trim: true }, // practice only, e.g. "React Fundamentals"

    application: {
      type: Schema.Types.ObjectId,
      ref: 'Application',
      index: true,
      required: [function requiredForRealInterview() { return !this.isPractice }, 'Application is required'],
    },
    candidate: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    job: {
      type: Schema.Types.ObjectId,
      ref: 'Job',
      required: [function requiredForRealInterview() { return !this.isPractice }, 'Job is required'],
    },

    language: { type: String, default: 'English' },
    totalQuestions: { type: Number, default: 5 },
    // Snapshot of the employer's questions taken when the interview starts, so
    // editing the job mid-interview can't change what is asked.
    hrQuestions: { type: [String], default: [] },
    // Detected once on the first question and reused, so every question in one
    // interview is asked in the same field's style.
    field: { type: String, default: '' },
    currentIndex: { type: Number, default: 0 }, // index of the un-answered question
    questions: { type: [questionSchema], default: [] },

    // Free conversation alongside the questions — see turnSchema.
    turns: { type: [turnSchema], default: [] },

    // Interview policy, snapshotted from the job at start so an employer
    // editing the job mid-interview can't change the rules under the candidate.
    allowTextAnswers: { type: Boolean, default: true },
    requireScreenShare: { type: Boolean, default: true },

    // Screen share (see screenEventSchema)
    screenEvents: { type: [screenEventSchema], default: [] },
    // Seconds the interview ran with the required share not active.
    screenGapSeconds: { type: Number, default: 0 },
    screenFlags: { type: Number, default: 0 },

    // Face + emotion (Phase 5)
    faceSamples: { type: [faceSampleSchema], default: [] },
    emotionScore: { type: Number, min: 0, max: 100, default: null }, // avg confidence
    faceMatchScore: { type: Number, min: 0, max: 100, default: null }, // avg identity match
    faceFlags: { type: Number, default: 0 }, // frames with no/extra person or mismatch

    // Voice biometrics (Phase 6)
    voiceSamples: { type: [voiceSampleSchema], default: [] },
    voiceRef: { type: [Number], default: undefined, select: false }, // reference voiceprint (first clip)
    // The interviewer's synthetic voice as this candidate's mic hears it, so
    // speaker leakage is never mistaken for a second person.
    interviewerVoiceRef: { type: [Number], default: undefined, select: false },
    voiceMatchScore: { type: Number, min: 0, max: 100, default: null },
    voiceFlags: { type: Number, default: 0 }, // clips with speaker mismatch or multiple voices

    // ── Proctoring: warn once, then end ──────────────────────────────────
    // Before this, cheating was only ever tallied silently at the end, so a
    // candidate with a second person in the room finished the whole interview
    // and found out afterwards. One warning is fair — a camera glitch or
    // someone walking past is not cheating. A second is a decision.
    violations: { type: [violationSchema], default: [] },
    // Periodic captures of the shared screen (see screenshotSchema).
    screenshots: { type: [screenshotSchema], default: [] },
    // Saved webcam stills of the candidate themselves (see faceShotSchema).
    faceShots: { type: [faceShotSchema], default: [] },
    // Running tally of frames where the candidate was looking away. Kept as a
    // count rather than a per-frame array: at one sample every few seconds this
    // would otherwise be the largest thing in the document, and the report only
    // ever shows the proportion.
    gazeAwayFrames: { type: Number, default: 0 },
    gazeTotalFrames: { type: Number, default: 0 },
    // This candidate's own resting head position, learned over the first few
    // forward-facing frames. Where the nose sits relative to the eye line
    // differs by face and by camera angle, so "looking down" can only be judged
    // against the person's own neutral — a fixed threshold flags everyone.
    // Stored as a running sum plus a count so it can be updated atomically
    // alongside the counters above.
    gazeBaselineSum: { type: Number, default: 0 },
    gazeBaselineCount: { type: Number, default: 0 },
    // Set when the interview was ended by the second strike, so the report can
    // lead with the rule that was broken rather than the score.
    terminatedFor: { type: String, default: '' },

    status: { type: String, enum: ['in_progress', 'completed'], default: 'in_progress', index: true },

    // ── Session integrity ────────────────────────────────────────────────
    // Without these an in-progress interview stayed resumable for ever, so a
    // candidate could read a question, leave, look the answer up and come back
    // — which makes the whole thing an open-book take-home and quietly
    // defeats the face and voice checks.
    //
    // Last sign of life from the candidate's page (answers, frames, heartbeat).
    // A gap longer than the grace period means they walked away.
    lastSeenAt: { type: Date, default: Date.now },
    // When the questions actually started, which is not when the record was
    // created: the candidate spends time first on the device pre-check, and
    // that must not eat into the interview they are then timed on.
    startedAt: { type: Date, default: null },
    // How many times they left and came back. Recorded for the report rather
    // than blocked outright: a dropped connection is not cheating, but a
    // pattern of it is worth an employer seeing.
    resumeCount: { type: Number, default: 0 },
    // Total seconds allowed, fixed when the interview starts so changing the
    // job later can't shorten a run already under way.
    timeLimitSeconds: { type: Number, default: 0 },
    // Set when the interview ended because they walked away or ran out of
    // time, rather than answering the last question.
    endedReason: {
      type: String,
      enum: ['', 'completed', 'abandoned', 'timeout', 'violation'],
      default: '',
    },

    // Set on finish
    overallScore: { type: Number, min: 0, max: 100, default: null },
    verdict: { type: String },
    strengths: { type: [String], default: [] },
    improvements: { type: [String], default: [] },
    // How the candidate engaged beyond answering: the questions they asked and
    // what those suggest. Never part of overallScore — see turnSchema.
    engagement: {
      questionsAsked: { type: Number, default: 0 },
      issuesReported: { type: Number, default: 0 },
      note: { type: String, default: '' },
    },
    completedAt: { type: Date },
  },
  { timestamps: true }
)

// Enforce "one in-progress interview per application/candidate" at the
// database level, not just via the check-then-act read in the controller —
// two concurrent /interviews/start (or /practice) calls for the same
// application/candidate would otherwise both pass the read check before
// either has saved, creating two in-progress interviews.
// Keyed as {application, status} / {candidate, status} rather than the bare
// field alone so this doesn't collide with the plain single-field indexes
// already declared via `index: true` above (same key = Mongoose warns about
// a duplicate schema index, even though the options differ).
interviewSchema.index(
  { application: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'in_progress', isPractice: false } }
)
interviewSchema.index(
  { candidate: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'in_progress', isPractice: true } }
)

interviewSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v
    return ret
  },
})

export default model('Interview', interviewSchema)
