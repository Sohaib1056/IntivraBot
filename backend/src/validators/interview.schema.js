import { z } from 'zod'

export const startSchema = z.object({
  applicationId: z.string().trim().min(1, 'applicationId is required'),
  language: z.enum(['English', 'Urdu', 'Roman Urdu']).optional(),
})

// Practice needs no application — an unknown topic falls back server-side.
export const practiceSchema = z.object({
  topic: z.string().trim().max(60).optional(),
  language: z.enum(['English', 'Urdu', 'Roman Urdu']).optional(),
})

export const answerSchema = z.object({
  answer: z.string().trim().min(1, 'Answer cannot be empty').max(5000),
  mode: z.enum(['voice', 'text']).optional(),
  reason: z.string().trim().max(200).optional(),
  // Set when the employer disallowed typing but the candidate reported a
  // genuine blocker. The server decides whether it actually applies.
  hardship: z.boolean().optional(),
})

// Anything the candidate says that is not an attempt to answer.
export const askSchema = z.object({
  text: z.string().trim().min(1, 'Say something first').max(2000),
})

// A proctoring rule the candidate's page detected being broken. The server
// decides the strike and whether the interview ends — see the controller.
export const violationSchema = z.object({
  type: z.enum([
    'multiple_faces',
    'no_face',
    'face_mismatch',
    'multiple_voices',
    'voice_mismatch',
    'screen_share',
    'tab_switch',
    'phone_detected',
    'notes_detected',
    'screen_detected',
    'spoofed_camera',
    'gaze_away',
    'offscreen_voice',
    'screen_cheating',
  ]),
  order: z.number().int().min(1).max(100).optional(),
  // The webcam frame that triggered this, kept as evidence for the report.
  // Optional: several of the rules above are not visual (a stopped screen
  // share, a switched tab) and have no picture to send.
  frame: z.string().optional(),
})

// Deeper (and costlier) checks over one webcam frame — see the controller.
export const proctorSchema = z.object({
  frame: z.string().min(1, 'No frame provided'),
  checks: z.array(z.enum(['gaze', 'objects', 'liveness'])).max(3).optional(),
})

// One periodic capture of the shared screen. `analyze` is opt-in because each
// analysed shot costs a vision call.
export const screenshotSchema = z.object({
  shot: z.string().min(1, 'No screenshot provided'),
  analyze: z.boolean().optional(),
})

export const screenSchema = z.object({
  type: z.enum(['started', 'stopped', 'wrong_surface']),
  surface: z.string().trim().max(40).optional(),
  gapSeconds: z.number().min(0).max(86400).optional(),
})
