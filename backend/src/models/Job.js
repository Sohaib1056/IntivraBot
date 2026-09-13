import mongoose from 'mongoose'

const { Schema, model } = mongoose

const jobSchema = new Schema(
  {
    hr: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: [true, 'Job title is required'], trim: true, maxlength: 120 },
    company: { type: String, trim: true, maxlength: 120 },
    description: { type: String, required: [true, 'Description is required'], maxlength: 5000 },
    skills: { type: [String], default: [] },
    location: { type: String, trim: true, default: 'Remote' },
    type: {
      type: String,
      enum: ['Full-time', 'Part-time', 'Contract', 'Internship'],
      default: 'Full-time',
    },
    experience: { type: String, trim: true, default: '' },

    // ── Compensation ──────────────────────────────────────────────────────
    // Stored as a range in whole currency units. Either end may be left blank
    // (an "up to X" or "from X" posting), and the whole block is optional —
    // `salaryDisclosed` is what decides if candidates see anything at all.
    salaryMin: { type: Number, min: 0, max: 100000000, default: null },
    salaryMax: { type: Number, min: 0, max: 100000000, default: null },
    salaryCurrency: { type: String, enum: ['PKR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'INR'], default: 'PKR' },
    salaryPeriod: { type: String, enum: ['month', 'year', 'hour'], default: 'month' },
    // "Market competitive" postings still record a range internally for
    // matching, but hide the numbers on the job board.
    salaryDisclosed: { type: Boolean, default: true },
    salaryNegotiable: { type: Boolean, default: false },
    benefits: { type: [String], default: [] },

    // ── Role logistics ────────────────────────────────────────────────────
    workMode: { type: String, enum: ['Onsite', 'Hybrid', 'Remote'], default: 'Onsite' },
    department: { type: String, trim: true, maxlength: 80, default: '' },
    openings: { type: Number, min: 1, max: 999, default: 1 },
    education: {
      type: String,
      enum: ['', 'Matric', 'Intermediate', 'Diploma', 'Bachelors', 'Masters', 'PhD'],
      default: '',
    },
    // Applications close on their own once this passes — see `isExpired`.
    deadline: { type: Date, default: null },

    // ── Longer-form copy, all optional ────────────────────────────────────
    responsibilities: { type: [String], default: [] },
    requirements: { type: [String], default: [] },
    niceToHaveSkills: { type: [String], default: [] },

    // ATS gate (Phase 3): a candidate must match >= applyThreshold to apply;
    // >= passThreshold marks a strong candidate.
    applyThreshold: { type: Number, min: 0, max: 100, default: 60 },
    passThreshold: { type: Number, min: 0, max: 100, default: 75 },

    // Questions this HR wants asked verbatim, on top of the AI's adaptive ones.
    // Asked after a warm-up; the AI fills whatever slots are left.
    customQuestions: { type: [String], default: [] },
    questionCount: { type: Number, min: 3, max: 15, default: 5 },
    // How long a candidate gets per question. The whole-interview budget is
    // this times questionCount, fixed when the interview starts. Employer's
    // call because it depends on the role: a support-desk answer is a minute,
    // a system-design answer is not.
    minutesPerQuestion: { type: Number, min: 1, max: 15, default: 4 },
    // The language the interview is conducted in — questions asked, replies
    // spoken, answers expected. Roman Urdu is listed separately from Urdu on
    // purpose: most Pakistani candidates read and write it far faster than the
    // script, and speech recognition handles it as Urdu audio either way.
    // 'Both' means a natural English/Roman-Urdu mix, which is how bilingual
    // Pakistani interviews actually run — the candidate answers in whichever
    // they reach for, and neither is marked down. See _LANGUAGE_LINES in
    // ai-services/app/core/interview.py.
    language: {
      type: String,
      enum: ['English', 'Urdu', 'Roman Urdu', 'Both'],
      default: 'English',
    },
    // Whether candidates may type their answers instead of speaking them.
    // This is the employer's call, not the candidate's: a spoken answer is what
    // the voice biometrics verify, so letting candidates opt out at will would
    // make the identity check optional in practice. When this is off a
    // candidate with a genuine problem can still raise a hardship request
    // (see Interview.textHardship) — the answer is accepted and flagged rather
    // than the candidate being locked out.
    allowTextAnswers: { type: Boolean, default: true },
    // Candidates must share their whole screen for the interview to run.
    requireScreenShare: { type: Boolean, default: true },
    // Which line of work this role is in — drives the interview's question
    // style. Auto-detected from the title + skills when the HR doesn't pick.
    field: { type: String, trim: true, default: '' },

    status: { type: String, enum: ['open', 'closed', 'draft'], default: 'open', index: true },
  },
  { timestamps: true }
)

// Text index powers keyword search across title, skills and company.
//
// `language_override` is REQUIRED here, not optional tuning. On a collection
// with a text index, MongoDB treats a field literally named `language` as the
// per-document stemming language and rejects any value outside its own list —
// so saving a job with language 'Roman Urdu' failed with
// "language override unsupported: Roman Urdu" at insert time, long after every
// Mongoose and zod validation had passed. Pointing the override at a field name
// nothing uses leaves our `language` free to mean what we mean by it.
jobSchema.index(
  { title: 'text', skills: 'text', company: 'text', department: 'text' },
  { language_override: 'textSearchLanguage' }
)

jobSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v
    return ret
  },
})

// A passed deadline closes applications without anyone editing the job.
// Plain functions rather than schema virtuals because every read path here
// uses .lean(), which does not carry virtuals.
export function isExpired(job) {
  return Boolean(job?.deadline && new Date(job.deadline).getTime() < Date.now())
}

// The single flag the apply gate and the UI both read, so an expired job and
// a closed one behave identically everywhere.
export function isAccepting(job) {
  return job?.status === 'open' && !isExpired(job)
}

export default model('Job', jobSchema)
