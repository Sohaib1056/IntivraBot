import { z } from 'zod'

const jobType = z.enum(['Full-time', 'Part-time', 'Contract', 'Internship'])
const workMode = z.enum(['Onsite', 'Hybrid', 'Remote'])
const currency = z.enum(['PKR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'INR'])
const salaryPeriod = z.enum(['month', 'year', 'hour'])
const education = z.enum(['', 'Matric', 'Intermediate', 'Diploma', 'Bachelors', 'Masters', 'PhD'])

// Salary inputs arrive from a number field, which yields '' when cleared.
// Treat blank as "not stated" rather than letting it fail as NaN.
const optionalAmount = z.preprocess(
  (v) => (v === '' || v == null ? null : v),
  z.number().min(0, 'Salary cannot be negative').max(100000000).nullable()
)

// A bullet list — blank rows are dropped rather than rejected, since the form
// keeps an empty row around for typing into.
const bulletList = (max, maxLen) =>
  z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : v),
    z.array(z.string().trim().min(1).max(maxLen)).max(max)
  )

const jobFields = z.object({
    title: z.string().trim().min(3, 'Title must be at least 3 characters').max(120),
    company: z.string().trim().max(120).optional(),
    description: z.string().trim().min(10, 'Description is too short').max(5000),
    skills: z.array(z.string().trim().min(1)).min(1, 'Add at least one skill').max(30),
    location: z.string().trim().max(120).optional(),
    type: jobType.optional(),
    experience: z.string().trim().max(60).optional(),

    // Compensation
    salaryMin: optionalAmount.optional(),
    salaryMax: optionalAmount.optional(),
    salaryCurrency: currency.optional(),
    salaryPeriod: salaryPeriod.optional(),
    salaryDisclosed: z.boolean().optional(),
    salaryNegotiable: z.boolean().optional(),
    benefits: bulletList(15, 60).optional(),

    // Role logistics
    workMode: workMode.optional(),
    department: z.string().trim().max(80).optional(),
    openings: z.number().int().min(1, 'At least one opening').max(999).optional(),
    education: education.optional(),
    deadline: z.preprocess(
      (v) => (v === '' || v == null ? null : v),
      z.coerce.date().nullable()
    ).optional(),

    // Longer-form copy
    responsibilities: bulletList(20, 300).optional(),
    requirements: bulletList(20, 300).optional(),
    niceToHaveSkills: z.array(z.string().trim().min(1)).max(30).optional(),

    applyThreshold: z.number().int().min(0).max(100).optional(),
    passThreshold: z.number().int().min(0).max(100).optional(),
    customQuestions: z.array(z.string().trim().min(5, 'A question needs at least 5 characters').max(300)).max(10).optional(),
    questionCount: z.number().int().min(3).max(15).optional(),
    minutesPerQuestion: z.number().int().min(1).max(15).optional(),
    language: z.enum(['English', 'Urdu', 'Roman Urdu', 'Both']).optional(),
    allowTextAnswers: z.boolean().optional(),
    requireScreenShare: z.boolean().optional(),
    field: z.string().trim().max(40).optional(),
    status: z.enum(['open', 'closed', 'draft']).optional(),
})

// Cross-field rules, applied to both create and update. Kept as a function so
// the update schema gets them too — chaining .refine() onto the object would
// make `.partial()` unreachable behind the resulting ZodEffects.
const withCrossFieldRules = (schema) =>
  schema
    .refine((d) => d.passThreshold == null || d.applyThreshold == null || d.passThreshold >= d.applyThreshold, {
      message: 'passThreshold must be greater than or equal to applyThreshold',
      path: ['passThreshold'],
    })
    .refine((d) => d.salaryMin == null || d.salaryMax == null || d.salaryMax >= d.salaryMin, {
      message: 'Maximum salary must be greater than or equal to the minimum',
      path: ['salaryMax'],
    })

export const createJobSchema = withCrossFieldRules(jobFields)
  // A deadline already in the past would publish a job nobody can apply to.
  // Only enforced on create: editing a job whose deadline has already lapsed
  // must stay possible, otherwise it could never be reopened.
  .refine((d) => d.deadline == null || d.deadline.getTime() > Date.now(), {
    message: 'The application deadline must be in the future',
    path: ['deadline'],
  })

// All fields optional for PATCH/PUT updates.
export const updateJobSchema = withCrossFieldRules(jobFields.partial())
