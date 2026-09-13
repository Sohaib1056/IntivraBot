import crypto from 'crypto'
import User from '../models/User.js'
import TeamInvite from '../models/TeamInvite.js'
import Job from '../models/Job.js'
import Application from '../models/Application.js'
import Interview from '../models/Interview.js'
import Notification from '../models/Notification.js'
import AppError from '../utils/AppError.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { signToken } from '../utils/token.js'
import { env, mailEnabled } from '../config/env.js'
import { companyRegex } from '../utils/companyMatch.js'
import { sendPasswordResetEmail } from '../services/mailer.js'

const sendAuth = (res, status, user) => {
  const token = signToken(user._id, user.role)
  res.status(status).json({ success: true, token, user })
}

// The `company` string is the trust boundary for an HR team: it drives the
// /api/team roster, invite links, and shared job/application/interview
// access (see utils/teamAccess.js). Without this check, any HR account could
// set `company` to an exact (case-insensitive) match of a real company's
// name and immediately see that company's team roster, jobs and applicants,
// and mint invite links for it. A brand-new company name is free to claim;
// an existing one requires a valid invite (which bypasses this check
// entirely by using the invite's own `company` value, not the caller's).
async function assertCompanyClaimable(company, currentUserId) {
  const trimmed = company.trim()
  if (!trimmed) return
  const owner = await User.findOne({ role: 'hr', company: { $regex: companyRegex(trimmed) } })
    .select('_id')
    .lean()
  if (owner && String(owner._id) !== String(currentUserId)) {
    throw new AppError(409, 'A team already exists for this company name — ask a teammate for an invite link instead.')
  }
}

// POST /api/auth/register
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, role, company, inviteCode } = req.body

  const exists = await User.findOne({ email })
  if (exists) throw new AppError(409, 'An account with that email already exists')

  // A valid team invite makes this an HR account joining that company.
  let finalRole = role
  let finalCompany = role === 'hr' ? company : undefined
  let invite = null
  if (inviteCode) {
    invite = await TeamInvite.findOne({ code: inviteCode })
    if (!invite || invite.used || new Date(invite.expiresAt) <= new Date()) {
      throw new AppError(400, 'This invite link is invalid or has expired')
    }
    finalRole = 'hr'
    finalCompany = invite.company
  } else if (finalRole === 'hr' && finalCompany) {
    // No invite — this is a self-serve signup claiming a company name
    // directly. Block it if that name is already taken by another HR team.
    await assertCompanyClaimable(finalCompany, null)
  }

  const user = await User.create({
    name,
    email,
    password,
    role: finalRole,
    company: finalCompany,
    // Joining via invite carries the role it was created with; a self-serve
    // signup is founding the company, so they're the Admin.
    teamRole: invite ? invite.role : 'Admin',
  })

  if (invite) {
    invite.used = true
    invite.usedBy = user._id
    await invite.save()
  }

  sendAuth(res, 201, user)
})

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body

  // password is select:false — pull it explicitly for comparison
  const user = await User.findOne({ email }).select('+password')
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError(401, 'Invalid email or password')
  }

  user.password = undefined // don't leak the hash in the response
  sendAuth(res, 200, user)
})

// GET /api/auth/me  (protected)
export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user })
})

// PATCH /api/auth/me  (protected) — update editable account fields
export const updateMe = asyncHandler(async (req, res) => {
  const { name, email, company, profile, hiring, settings, onboardingComplete } = req.body

  const user = await User.findById(req.user._id)
  if (!user) throw new AppError(404, 'User not found')

  if (name != null) user.name = name

  // Email is an account identifier — reject if another account already has it.
  if (email != null && email !== user.email) {
    const taken = await User.exists({ email, _id: { $ne: user._id } })
    if (taken) throw new AppError(409, 'That email is already in use')
    user.email = email
  }

  if (user.role === 'hr' && company != null && company.trim() !== (user.company || '')) {
    // Changing to a brand-new name is fine; hopping into an existing
    // company's name without an invite is the exact IDOR this check exists
    // to block (see assertCompanyClaimable above).
    await assertCompanyClaimable(company, user._id)
    user.company = company
  }

  if (profile) {
    const keys = [
      'headline', 'location', 'skills', 'experienceYears',
      'currentStatus', 'education', 'preferredRole', 'jobType',
      'phone', 'linkedinUrl', 'primarySkill', 'certifications',
      'expectedSalary', 'noticePeriod', 'workMode', 'willingToRelocate',
    ]
    for (const key of keys) {
      if (profile[key] !== undefined) user.profile[key] = profile[key]
    }
  }

  if (hiring && user.role === 'hr') {
    for (const key of [
      'industry', 'size', 'designation', 'departments',
      'applyThreshold', 'passThreshold', 'language', 'questionsPerInterview',
      'minutesPerQuestion',
    ]) {
      if (hiring[key] !== undefined) user.hiring[key] = hiring[key]
    }
    if (user.hiring.passThreshold < user.hiring.applyThreshold) {
      throw new AppError(400, 'Pass threshold must be greater than or equal to the apply threshold')
    }
  }

  if (settings) {
    for (const key of ['language', 'emailNotifications', 'pushNotifications', 'faceVoiceConsent']) {
      if (settings[key] !== undefined) user.settings[key] = settings[key]
    }
  }

  // Stamped on the wizard's final step. Kept idempotent so re-running the
  // wizard later doesn't rewrite when they first completed it.
  if (onboardingComplete && !user.onboardingCompletedAt) {
    user.onboardingCompletedAt = new Date()
  }

  await user.save()
  res.json({ success: true, user })
})

// PATCH /api/auth/password  (protected) — change password with the current one
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body

  const user = await User.findById(req.user._id).select('+password')
  if (!user) throw new AppError(404, 'User not found')
  if (!(await user.comparePassword(currentPassword))) {
    throw new AppError(401, 'Your current password is incorrect')
  }
  if (currentPassword === newPassword) {
    throw new AppError(400, 'The new password must be different from the current one')
  }

  user.password = newPassword // hashed by the pre-save hook
  await user.save()

  user.password = undefined
  // Issue a fresh token so the client keeps a valid session after the change.
  sendAuth(res, 200, user)
})

// GET /api/auth/me/export  (protected) — everything we hold about this account
export const exportMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).lean()
  const isHr = user.role === 'hr'

  const jobs = isHr ? await Job.find({ hr: user._id }).lean() : []
  const applications = isHr
    ? await Application.find({ job: { $in: jobs.map((j) => j._id) } }).lean()
    : await Application.find({ candidate: user._id }).lean()
  const interviews = await Interview.find(
    isHr ? { job: { $in: jobs.map((j) => j._id) } } : { candidate: user._id }
  ).lean()
  const notifications = await Notification.find({ user: user._id }).lean()

  res.json({
    success: true,
    exportedAt: new Date().toISOString(),
    account: user,
    jobs,
    applications,
    interviews,
    notifications,
  })
})

// DELETE /api/auth/me  (protected) — permanently remove the account + its data
export const deleteMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password')
  if (!user) throw new AppError(404, 'User not found')
  if (!(await user.comparePassword(req.body.password))) {
    throw new AppError(401, 'Password is incorrect')
  }

  if (user.role === 'hr') {
    const jobs = await Job.find({ hr: user._id }).select('_id').lean()
    const jobIds = jobs.map((j) => j._id)
    await Interview.deleteMany({ job: { $in: jobIds } })
    await Application.deleteMany({ job: { $in: jobIds } })
    await Job.deleteMany({ hr: user._id })
    await TeamInvite.deleteMany({ invitedBy: user._id, used: false })
  } else {
    await Interview.deleteMany({ candidate: user._id })
    await Application.deleteMany({ candidate: user._id })
  }
  await Notification.deleteMany({ user: user._id })
  await user.deleteOne()

  res.json({ success: true, message: 'Your account and its data have been deleted' })
})

// POST /api/auth/forgot-password
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body
  const user = await User.findOne({ email })

  // Always respond the same way — don't reveal whether an email exists.
  const genericResponse = {
    success: true,
    message: 'If an account exists for that email, a reset link has been sent.',
  }

  if (!user) return res.json(genericResponse)

  const rawToken = user.createResetToken()
  await user.save({ validateBeforeSave: false })

  // The link points at the frontend, which reads the token out of the query
  // string and posts it back to /reset-password.
  const resetUrl = `${env.clientUrls[0]}/reset-password?token=${rawToken}`

  const sent = await sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    resetUrl,
    expiresMinutes: 30,
  })

  // With no mail provider configured (or a send that failed), hand the link
  // back in the response outside production so the flow is still usable.
  // Never in production: that would let anyone reset any account.
  if (!sent && !env.isProd) {
    return res.json({
      ...genericResponse,
      devResetToken: rawToken,
      devResetUrl: resetUrl,
      devNote: mailEnabled
        ? 'Email failed to send - check MAIL_USER / MAIL_PASS.'
        : 'Email is not configured. Set MAIL_USER and MAIL_PASS in backend/.env to send real emails.',
    })
  }

  res.json(genericResponse)
})

// POST /api/auth/reset-password
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const user = await User.findOne({
    resetTokenHash: tokenHash,
    resetTokenExpires: { $gt: Date.now() },
  }).select('+resetTokenHash +resetTokenExpires')

  if (!user) throw new AppError(400, 'Reset link is invalid or has expired')

  user.password = password
  user.resetTokenHash = undefined
  user.resetTokenExpires = undefined
  await user.save()

  sendAuth(res, 200, user)
})
