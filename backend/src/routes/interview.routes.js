import { Router } from 'express'
import { protect, restrictTo } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { startSchema, practiceSchema, answerSchema, askSchema, screenSchema, violationSchema, proctorSchema, screenshotSchema } from '../validators/interview.schema.js'
import { start, startPractice, answer, ask, begin, screen, finish, frame, voice, voiceCheck, faceCheck, violation, proctorFrame, screenshot, myInterviews, hrSchedule, getInterview } from '../controllers/interview.controller.js'

const router = Router()

router.use(protect)

router.post('/start', restrictTo('candidate'), validate(startSchema), start)
router.post('/practice', restrictTo('candidate'), validate(practiceSchema), startPractice)
// Pre-check identity verification: both run before any interview exists, so
// they are fixed paths rather than ones under '/:id'. Kept with the other
// fixed paths.
router.post('/voice-check', restrictTo('candidate'), voiceCheck)
router.post('/face-check', restrictTo('candidate'), faceCheck)
router.post('/:id/answer', restrictTo('candidate'), validate(answerSchema), answer)
router.post('/:id/ask', restrictTo('candidate'), validate(askSchema), ask)
router.post('/:id/begin', restrictTo('candidate'), begin)
router.post('/:id/screen', restrictTo('candidate'), validate(screenSchema), screen)
router.post('/:id/frame', restrictTo('candidate'), frame)
router.post('/:id/voice', restrictTo('candidate'), voice)
router.post('/:id/violation', restrictTo('candidate'), validate(violationSchema), violation)
router.post('/:id/proctor', restrictTo('candidate'), validate(proctorSchema), proctorFrame)
router.post('/:id/screenshot', restrictTo('candidate'), validate(screenshotSchema), screenshot)
router.post('/:id/finish', restrictTo('candidate'), finish)
router.get('/mine', restrictTo('candidate'), myInterviews) // must precede '/:id'
router.get('/hr/schedule', restrictTo('hr'), hrSchedule) // must precede '/:id'
router.get('/:id', getInterview) // candidate owner or HR who owns the job

export default router
