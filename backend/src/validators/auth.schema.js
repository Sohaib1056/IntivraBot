import { z } from 'zod'

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your full name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  role: z.enum(['candidate', 'hr'], { errorMap: () => ({ message: 'Role must be candidate or hr' }) }),
  company: z.string().trim().max(120).optional(),
  inviteCode: z.string().trim().max(64).optional(), // joins an HR team when valid
})

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
})

export const resetSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
})

// Editable account fields. Role and photo/resume URLs are intentionally
// excluded — those are changed through dedicated flows. Password has its own
// endpoint because it needs the current password.
export const updateMeSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your full name').max(80).optional(),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').optional(),
  company: z.string().trim().max(120).optional(),
  profile: z
    .object({
      headline: z.string().trim().max(120).optional(),
      location: z.string().trim().max(120).optional(),
      skills: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
      experienceYears: z.number().min(0).max(50).optional(),
      currentStatus: z.string().trim().max(60).optional(),
      education: z.string().trim().max(60).optional(),
      preferredRole: z.string().trim().max(120).optional(),
      jobType: z.string().trim().max(40).optional(),
      phone: z.string().trim().max(30).optional(),
      // Candidates usually type "linkedin.com/in/me" — add the missing scheme
      // rather than rejecting it. An empty string clears the field.
      linkedinUrl: z
        .preprocess(
          (v) =>
            typeof v === 'string' && v.trim() && !/^https?:\/\//i.test(v.trim())
              ? `https://${v.trim()}`
              : v,
          z.union([z.string().trim().url('Enter a valid link, e.g. linkedin.com/in/your-name').max(240), z.literal('')])
        )
        .optional(),
      primarySkill: z.string().trim().max(40).optional(),
      certifications: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
      expectedSalary: z.string().trim().max(60).optional(),
      noticePeriod: z.string().trim().max(40).optional(),
      workMode: z.string().trim().max(40).optional(),
      willingToRelocate: z.boolean().optional(),
    })
    .optional(),
  hiring: z
    .object({
      industry: z.string().trim().max(80).optional(),
      size: z.string().trim().max(40).optional(),
      designation: z.string().trim().max(80).optional(),
      departments: z.string().trim().max(200).optional(),
      applyThreshold: z.number().min(0).max(100).optional(),
      passThreshold: z.number().min(0).max(100).optional(),
      // Interview language — mirrors Job.language, not the interface
      // preference in `settings` below (which has its own "Both" option).
      language: z.enum(['English', 'Urdu', 'Roman Urdu', 'Both']).optional(),
      questionsPerInterview: z.number().min(3).max(15).optional(),
      minutesPerQuestion: z.number().min(1).max(15).optional(),
    })
    .optional(),
  settings: z
    .object({
      language: z.enum(['English', 'Urdu', 'Both']).optional(),
      emailNotifications: z.boolean().optional(),
      pushNotifications: z.boolean().optional(),
      faceVoiceConsent: z.boolean().optional(),
    })
    .optional(),
  // Sent by the last step of the signup wizard. Only `true` is accepted — the
  // timestamp itself is the server's to set, and completion can't be undone.
  onboardingComplete: z.literal(true).optional(),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(100),
})

export const deleteMeSchema = z.object({
  password: z.string().min(1, 'Enter your password to confirm'),
})
