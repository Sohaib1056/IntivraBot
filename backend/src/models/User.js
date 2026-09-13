import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const { Schema, model } = mongoose

// Candidate-specific profile (extended in later phases: resume, ATS, voice).
const profileSchema = new Schema(
  {
    headline: { type: String, trim: true },
    location: { type: String, trim: true },
    skills: { type: [String], default: [] },
    experienceYears: { type: Number, default: 0 },
    resumeUrl: { type: String },
    // Kept so the CV can be streamed back through our own /uploads/resume/:id
    // endpoint — Cloudinary blocks direct PDF delivery on the CDN.
    resumePublicId: { type: String },
    resumeExt: { type: String },
    resumeName: { type: String },
    // Text pulled out of the CV at upload time. Kept server-side so matching
    // and the apply gate work off the real CV without asking the candidate to
    // paste it again for every job. Never selected by default — it's large.
    resumeText: { type: String, select: false },
    resumeSkills: { type: [String], default: [] }, // parsed from resumeText
    resumeUpdatedAt: { type: Date },
    // Account-level voiceprint, enrolled from the Profile page. Interviews
    // prefer this over the per-interview reference clip, so a stand-in is
    // caught on the very first answer instead of only mid-interview.
    voiceEnrolled: { type: Boolean, default: false },
    voiceRef: { type: [Number], default: undefined, select: false },
    voiceEnrolledAt: { type: Date },

    // Captured by the candidate onboarding wizard.
    currentStatus: { type: String, trim: true },
    education: { type: String, trim: true },
    preferredRole: { type: String, trim: true },
    jobType: { type: String, trim: true },

    // Contact / public profile (onboarding step 1)
    phone: { type: String, trim: true },
    linkedinUrl: { type: String, trim: true },

    // Skills detail (onboarding step 2)
    primarySkill: { type: String, trim: true },
    certifications: { type: [String], default: [] },

    // Job preferences detail (onboarding step 3)
    expectedSalary: { type: String, trim: true },
    noticePeriod: { type: String, trim: true },
    workMode: { type: String, trim: true },
    willingToRelocate: { type: Boolean, default: false },
  },
  { _id: false }
)

// HR hiring defaults, captured by the HR onboarding wizard and reused as the
// pre-filled values on the Post Job form.
const hiringSchema = new Schema(
  {
    industry: { type: String, trim: true },
    size: { type: String, trim: true },
    designation: { type: String, trim: true },
    departments: { type: String, trim: true },
    applyThreshold: { type: Number, min: 0, max: 100, default: 70 },
    passThreshold: { type: Number, min: 0, max: 100, default: 80 },
    // Default interview language for new jobs. Must stay in step with
    // Job.language — this is what pre-fills that field, so a value allowed
    // here and rejected there (or the reverse) is a dead end for the employer.
    language: {
      type: String,
      enum: ['English', 'Urdu', 'Roman Urdu', 'Both'],
      default: 'English',
    },
    questionsPerInterview: { type: Number, min: 3, max: 15, default: 5 },
    // Pre-fills the per-question time budget on new jobs; see Job.minutesPerQuestion.
    minutesPerQuestion: { type: Number, min: 1, max: 15, default: 4 },
  },
  { _id: false }
)

// Account preferences shown on the Settings page (both roles).
const settingsSchema = new Schema(
  {
    language: { type: String, enum: ['English', 'Urdu', 'Both'], default: 'Both' },
    emailNotifications: { type: Boolean, default: true },
    pushNotifications: { type: Boolean, default: false },
    // Face & voice verification consent — interviews check this before capturing.
    faceVoiceConsent: { type: Boolean, default: true },
  },
  { _id: false }
)

const userSchema = new Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 80 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // Never selected by default — must explicitly .select('+password')
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ['candidate', 'hr'], required: true },

    // HR-specific
    company: { type: String, trim: true },
    // The role picked when this HR was invited (or 'Admin' for whoever
    // created the company by registering without an invite). Currently a
    // display label on the Team page only — no permission is actually gated
    // on it yet.
    teamRole: { type: String, enum: ['Admin', 'Recruiter', 'Viewer'], default: 'Admin' },

    photoUrl: { type: String },
    profile: { type: profileSchema, default: () => ({}) },
    hiring: { type: hiringSchema, default: () => ({}) },
    settings: { type: settingsSchema, default: () => ({}) },

    // Set once, when the signup wizard's last step is submitted. Unset means
    // the wizard was never finished — every protected route sends them back to
    // it, so abandoning the wizard and signing in again can't skip it.
    onboardingCompletedAt: { type: Date },

    // Password reset
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
  },
  { timestamps: true }
)

// Hash password whenever it changes.
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 12)
  next()
})

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password)
}

// Creates a raw reset token (returned to caller/email) and stores only its hash.
userSchema.methods.createResetToken = function createResetToken() {
  const raw = crypto.randomBytes(32).toString('hex')
  this.resetTokenHash = crypto.createHash('sha256').update(raw).digest('hex')
  this.resetTokenExpires = Date.now() + 30 * 60 * 1000 // 30 min
  return raw
}

// Strip sensitive fields from all JSON responses.
userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.password
    delete ret.resetTokenHash
    delete ret.resetTokenExpires
    delete ret.__v
    return ret
  },
})

export default model('User', userSchema)
