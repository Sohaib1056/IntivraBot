import mongoose from 'mongoose'
import Job, { isExpired } from '../models/Job.js'
import Application from '../models/Application.js'
import AppError from '../utils/AppError.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { candidateMatchProfile, scoreJobsForCandidate, attachMatch } from '../services/matching.js'
import { aiService } from '../services/aiService.js'
import { teamMemberIds, isTeammateOf } from '../utils/teamAccess.js'

// Attaches applicantsCount to a list of plain job objects in one query.
async function withApplicantCounts(jobs) {
  if (!jobs.length) return jobs
  const ids = jobs.map((j) => j._id)
  const counts = await Application.aggregate([
    { $match: { job: { $in: ids } } },
    { $group: { _id: '$job', n: { $sum: 1 } } },
  ])
  const map = new Map(counts.map((c) => [String(c._id), c.n]))
  return jobs.map((j) => ({ ...j, applicantsCount: map.get(String(j._id)) || 0 }))
}

// GET /api/jobs  — browse/search (any authenticated user)
export const listJobs = asyncHandler(async (req, res) => {
  const { q, type, status = 'open', page = 1, limit = 10, sort, minMatch, eligible } = req.query
  const filter = {}
  if (status !== 'all') filter.status = status
  if (type) filter.type = type
  if (q) filter.$text = { $search: q }

  const pageNum = Math.max(1, Number(page))
  const perPage = Math.min(50, Math.max(1, Number(limit)))
  const isCandidate = req.user?.role === 'candidate'
  // Candidates only see jobs still taking applications — a passed deadline
  // hides the job from the board (HR still sees it, marked expired).
  if (isCandidate) filter.$or = [{ deadline: null }, { deadline: { $gte: new Date() } }]

  // Sorting or filtering by match needs every job scored, not just one page —
  // a job on page 3 can easily be the best fit. Candidates' boards are small
  // enough (capped below) that scoring the set in one AI call is fine.
  const eligibleOnly = eligible === '1' || eligible === 'true'
  const byMatch = isCandidate && (sort === 'match' || minMatch || eligibleOnly)

  if (!byMatch) {
    const [total, docs] = await Promise.all([
      Job.countDocuments(filter),
      Job.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * perPage)
        .limit(perPage)
        .lean(),
    ])

    let jobs = await withApplicantCounts(docs)
    if (isCandidate) {
      const profile = await candidateMatchProfile(req.user._id)
      jobs = attachMatch(jobs, await scoreJobsForCandidate(profile, jobs))
    }
    return res.json({
      success: true,
      jobs,
      pagination: { page: pageNum, limit: perPage, total, pages: Math.ceil(total / perPage) },
    })
  }

  const MATCH_SCAN_LIMIT = 200
  const docs = await Job.find(filter).sort({ createdAt: -1 }).limit(MATCH_SCAN_LIMIT).lean()
  const profile = await candidateMatchProfile(req.user._id)
  let scored = attachMatch(docs, await scoreJobsForCandidate(profile, docs))

  // Unscored jobs (AI service down) survive every filter — hiding them would
  // look like the board had emptied out.
  const floor = Number(minMatch)
  if (Number.isFinite(floor)) {
    scored = scored.filter((j) => j.matchScore == null || j.matchScore >= floor)
  }
  if (eligibleOnly) {
    scored = scored.filter((j) => j.matchScore == null || j.eligible)
  }
  if (sort === 'match') {
    scored.sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1))
  }

  const total = scored.length
  const pageDocs = scored.slice((pageNum - 1) * perPage, pageNum * perPage)
  res.json({
    success: true,
    jobs: await withApplicantCounts(pageDocs),
    pagination: { page: pageNum, limit: perPage, total, pages: Math.ceil(total / perPage) },
  })
})

// GET /api/jobs/mine  — postings owned by the HR's whole team (same company)
export const myJobs = asyncHandler(async (req, res) => {
  const ids = await teamMemberIds(req.user)
  const docs = (await Job.find({ hr: { $in: ids } }).sort({ createdAt: -1 }).lean())
    .map((j) => ({ ...j, isExpired: isExpired(j) }))
  const jobs = await withApplicantCounts(docs)
  res.json({ success: true, jobs })
})

// GET /api/jobs/:id  — single job (+ applicant count, + hasApplied for candidates)
export const getJob = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid job id')
  const job = await Job.findById(req.params.id).lean()
  if (!job) throw new AppError(404, 'Job not found')

  const applicantsCount = await Application.countDocuments({ job: job._id })
  let hasApplied = false
  let matched = { ...job }

  if (req.user?.role === 'candidate') {
    hasApplied = !!(await Application.exists({ job: job._id, candidate: req.user._id }))
    // Score against the stored CV so the page can show the match — and whether
    // they clear the bar — before they ever press Apply.
    const profile = await candidateMatchProfile(req.user._id)
    ;[matched] = attachMatch([job], await scoreJobsForCandidate(profile, [job]))
    matched.hasResume = profile.hasResume
  }

  res.json({ success: true, job: { ...matched, isExpired: isExpired(job), applicantsCount, hasApplied } })
})

// POST /api/jobs  — HR only
export const createJob = asyncHandler(async (req, res) => {
  // Work out the field once, at post time — it decides the interview's whole
  // question style, and the HR shouldn't have to classify their own job.
  let field = req.body.field
  if (!field) {
    const detected = await aiService.detectField(req.body.title, req.body.skills || [])
    field = detected?.field || ''
  }

  const job = await Job.create({
    ...req.body,
    field,
    company: req.body.company || req.user.company || undefined,
    hr: req.user._id,
  })
  res.status(201).json({ success: true, job })
})

// Loads a job and asserts the current HR owns it or shares a team with the
// HR who does.
async function getOwnedJob(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid job id')
  const job = await Job.findById(req.params.id)
  if (!job) throw new AppError(404, 'Job not found')
  if (!(await isTeammateOf(req.user, job.hr))) {
    throw new AppError(403, 'You can only manage jobs from your own team')
  }
  return job
}

// PUT /api/jobs/:id  — HR owner only
export const updateJob = asyncHandler(async (req, res) => {
  const job = await getOwnedJob(req)

  // Re-detect the field when the title or skills change — otherwise a job
  // repurposed from "React Developer" to "IT Support Officer" would keep
  // running developer-style interviews.
  const retitled = req.body.title != null && req.body.title !== job.title
  const reskilled =
    req.body.skills != null && req.body.skills.join('|') !== (job.skills || []).join('|')

  Object.assign(job, req.body)

  if (req.body.field == null && (retitled || reskilled)) {
    const detected = await aiService.detectField(job.title, job.skills || [])
    if (detected?.field) job.field = detected.field
  }

  await job.save()
  res.json({ success: true, job })
})

// DELETE /api/jobs/:id  — HR owner only (also removes its applications)
export const deleteJob = asyncHandler(async (req, res) => {
  const job = await getOwnedJob(req)
  await Application.deleteMany({ job: job._id })
  await job.deleteOne()
  res.json({ success: true, message: 'Job and its applications removed' })
})
