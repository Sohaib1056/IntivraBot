import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Check, AlertTriangle, Download, ScanFace, Mic, Type, MonitorUp,
  MessageSquare, TrendingUp, TrendingDown, Clock, FileText, ExternalLink, Loader2,
  ShieldAlert, Eye,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Ring } from '../../components/ui/Progress'
import Progress from '../../components/ui/Progress'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/useFetch'
import { useToast } from '../../context/ToastContext'
import { shortDate } from '../../lib/format'

const statusTone = {
  applied: 'gray', screened: 'amber', shortlisted: 'green',
  interviewed: 'amber', passed: 'green', rejected: 'red',
}

function initials(name = '') {
  return name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase() || '?'
}

export default function CandidateReport() {
  const { id } = useParams()
  const { data, loading, error } = useFetch(() => api.get(`/applications/${id}`), [id])

  if (loading) {
    return <div className="flex justify-center py-20 text-brand-600"><Spinner size={28} /></div>
  }
  if (error || !data?.application) {
    return (
      <EmptyState
        icon={FileText}
        title="Couldn’t load this candidate"
        description={error || 'The application could not be found.'}
        action={<Button as={Link} to="/hr/applications">Back to applications</Button>}
      />
    )
  }

  return <Report application={data.application} interview={data.interview} />
}

function Report({ application, interview }) {
  const toast = useToast()
  const c = application.candidate || {}
  const job = application.job || {}

  const [notes, setNotes] = useState(application.hrNotes || '')
  // What's actually on the server, so "Save" disables again after a save.
  const [savedNotes, setSavedNotes] = useState(application.hrNotes || '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [savedAt, setSavedAt] = useState(application.hrNotesUpdatedAt || null)
  const [openingCv, setOpeningCv] = useState(false)
  const [photoBroken, setPhotoBroken] = useState(false)

  const hasResume = Boolean(c.profile?.resumeUrl)

  // The CV is streamed through our API (Cloudinary blocks direct PDF delivery)
  // and the endpoint checks this HR actually received an application from them.
  const openCv = async () => {
    const tab = window.open('', '_blank') // opened up-front, or popup blockers trip
    setOpeningCv(true)
    try {
      const url = await api.blobUrl(`/uploads/resume/${c._id}`)
      if (tab) tab.location = url
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      tab?.close()
      toast.error(err.message || 'Could not open the CV')
    } finally {
      setOpeningCv(false)
    }
  }

  const saveNotes = async () => {
    setSavingNotes(true)
    try {
      const res = await api.patch(`/applications/${application._id}/notes`, { notes })
      setSavedAt(res.hrNotesUpdatedAt)
      setSavedNotes(res.hrNotes ?? notes)
      toast.success('Note saved')
    } catch (err) {
      toast.error(err.message || 'Could not save the note')
    } finally {
      setSavingNotes(false)
    }
  }
  const answered = (interview?.questions || []).filter((q) => q.answer)
  const textAnswers = answered.filter((q) => q.mode === 'text')

  const passThreshold = job.passThreshold ?? 60
  const ats = application.atsScore
  const interviewScore = interview?.overallScore ?? application.interviewScore
  const emotion = application.emotionScore ?? interview?.emotionScore // Phase 5

  // Face + emotion (Phase 5)
  const faceSamples = interview?.faceSamples || []
  const emotionTrend = faceSamples.map((s, i) => ({ t: `Q${s.order || i + 1}`, confidence: s.confidence ?? 0, stress: s.stress ?? 0 }))
  const faceMatch = interview?.faceMatchScore
  const faceFlags = interview?.faceFlags ?? 0
  const voiceMatch = interview?.voiceMatchScore
  const voiceFlags = interview?.voiceFlags ?? 0

  // Proctoring violations. `endedReason === 'violation'` means the interview
  // was cut short by the second strike, so the score below covers only the
  // questions reached before that — which the banner has to say, or the number
  // reads as an ordinary weak interview.
  const violations = interview?.violations || []
  const terminated = interview?.endedReason === 'violation'
  const endedReason = interview?.endedReason || ''

  // Periodic captures of the shared screen, and what the vision check made of
  // them. Shown as a timeline so HR can see the screen at any point rather
  // than taking a flag's word for it.
  const screenshots = interview?.screenshots || []
  const flaggedShots = screenshots.filter((s) => (s.findings || []).length > 0)

  // Webcam stills of the candidate themselves. The identity numbers below are
  // only as convincing as the pictures behind them — "41% match" is an
  // accusation nobody can check without seeing who was actually on camera.
  const faceShots = interview?.faceShots || []
  const referenceShot = faceShots.find((s) => s.kind === 'reference')
  const violationShots = faceShots.filter((s) => s.kind === 'violation')

  // Gaze: reported as a proportion, never as a raw count — "38 frames looking
  // away" means nothing without knowing how many there were in total.
  const gazeTotal = interview?.gazeTotalFrames ?? 0
  const gazeAway = interview?.gazeAwayFrames ?? 0
  const gazeAwayPct = gazeTotal >= 10 ? Math.round((gazeAway / gazeTotal) * 100) : null

  // Screen share
  const screenFlags = interview?.screenFlags ?? 0
  const screenRequired = interview?.requireScreenShare === true
  const screenGap = interview?.screenGapSeconds ?? 0

  // The side conversation, paired so each thing the candidate raised shows the
  // interviewer's reply underneath it. Turns are stored flat and strictly in
  // order (candidate, then ai), so the reply is simply the next entry.
  const turns = interview?.turns || []
  const candidateTurns = turns
    .map((t, i) => ({ ...t, reply: turns[i + 1]?.role === 'ai' ? turns[i + 1].text : '' }))
    .filter((t) => t.role === 'candidate')

  // Overall = average of the scores we actually have.
  const known = [ats, interviewScore, emotion].filter((v) => v != null)
  const overall = known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : 0
  const recommendation = overall >= 80 ? 'Strong fit' : overall >= 65 ? 'Average fit' : 'Weak fit'

  const trend = answered.map((q, i) => ({ t: `Q${q.order || i + 1}`, score: q.score ?? 0 }))

  const scoreRows = [
    ['Resume match (ATS)', ats],
    ['Interview answers', interviewScore],
    ['Emotion / confidence', emotion],
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link to="/hr/applications" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Back to applications
      </Link>

      {/* Why the interview ended, when it did not end normally. Placed above
          the scores on purpose: an interview terminated for a rule-break is a
          different thing from a low score, and reading the number first would
          give exactly the wrong impression. */}
      {(terminated || violations.length > 0) && (
        <div
          className={cn(
            'rounded-xl border-2 p-5',
            terminated ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'
          )}
        >
          <div className="flex items-start gap-3">
            <ShieldAlert
              className={cn('mt-0.5 h-5 w-5 shrink-0', terminated ? 'text-red-600' : 'text-amber-600')}
            />
            <div className="min-w-0 flex-1">
              <h2 className={cn('text-sm font-bold', terminated ? 'text-red-900' : 'text-amber-900')}>
                {terminated
                  ? 'This interview was ended automatically for a verification violation'
                  : `${violations.length} verification warning${violations.length === 1 ? '' : 's'} were issued during this interview`}
              </h2>
              <p className={cn('mt-1 text-xs leading-relaxed', terminated ? 'text-red-800' : 'text-amber-800')}>
                {terminated
                  ? <>
                      <strong>Reason: {interview.terminatedFor}</strong>{' '}
                      The candidate was warned once, the same problem or another
                      rule was detected again, and the interview was closed at that
                      point. The scores below cover only the questions they reached.
                    </>
                  : 'The candidate was warned but corrected the problem, so the interview ran to the end. Listed for your judgement — it did not change the score.'}
              </p>

              {/* Each incident, in order, with the exact rule and when it
                  happened — so this is reviewable rather than just asserted. */}
              <ol className="mt-3 space-y-2">
                {violations.map((v, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 rounded-lg bg-white/70 px-3 py-2 text-xs"
                  >
                    <span
                      className={cn(
                        'mt-px shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                        v.strike >= 2 ? 'bg-red-200 text-red-900' : 'bg-amber-200 text-amber-900'
                      )}
                    >
                      {v.strike >= 2 ? 'Ended' : `Warning ${v.strike}`}
                    </span>
                    <span className="min-w-0 flex-1 text-ink-700">
                      {v.detail}
                      <span className="ml-1 text-ink-400">
                        (question {v.order || '—'}
                        {v.atSeconds != null
                          ? `, ${Math.floor(v.atSeconds / 60)}m ${v.atSeconds % 60}s in`
                          : ''}
                        )
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* The other two ways an interview can end short of the last question.
          Same reasoning: a partial score needs its explanation next to it. */}
      {(endedReason === 'abandoned' || endedReason === 'timeout') && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            {endedReason === 'timeout'
              ? 'This interview ran out of time before the last question. Unanswered questions counted as zero.'
              : 'The candidate left this interview and did not return within five minutes, so it was submitted automatically. Unanswered questions counted as zero.'}
          </p>
        </div>
      )}

      {/* Header */}
      <div className="card-base p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            {/* photoUrl can 404 (image deleted from storage) — fall back to
                initials rather than showing a broken-image icon. */}
            {c.photoUrl && !photoBroken ? (
              <img
                src={c.photoUrl}
                alt={c.name || 'Candidate'}
                onError={() => setPhotoBroken(true)}
                className="h-16 w-16 rounded-2xl object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-100 text-xl font-bold text-ink-600">
                {initials(c.name)}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-ink-900">{c.name || 'Candidate'}</h1>
                <Badge tone={statusTone[application.status] || 'gray'}>{application.status}</Badge>
                {application.flags > 0 && (
                  <Badge tone="amber"><AlertTriangle className="h-3 w-3" /> {application.flags} flag{application.flags > 1 ? 's' : ''}</Badge>
                )}
              </div>
              <p className="text-sm text-ink-500">
                {job.title || 'Role'}
                {c.email ? ` · ${c.email}` : ''}
                {application.createdAt ? ` · Applied ${shortDate(application.createdAt)}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            {hasResume && (
              <Button variant="secondary" onClick={openCv} disabled={openingCv}>
                {openingCv
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <FileText className="h-4 w-4" />}
                View CV <ExternalLink className="h-3 w-3" />
              </Button>
            )}
            {/* Browsers' "Save as PDF" is what an HR actually wants to send on. */}
            <Button variant="secondary" onClick={() => window.print()}>
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Scores */}
          <Card>
            <CardHeader title="Score breakdown" subtitle={`Pass threshold ${passThreshold}%`} />
            <CardBody className="grid gap-5 sm:grid-cols-2">
              {scoreRows.map(([label, v]) => (
                <div key={label}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-medium text-ink-700">{label}</span>
                    <span className="font-semibold text-ink-900">{v != null ? `${v}%` : '—'}</span>
                  </div>
                  {v != null ? (
                    <Progress value={v} />
                  ) : (
                    <p className="text-xs text-ink-400">Not available yet</p>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>

          {/* Interview trend */}
          {trend.length > 1 && (
            <Card>
              <CardHeader title="Score across the interview" subtitle="How each answer was scored" />
              <CardBody>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="t" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Line type="monotone" dataKey="score" stroke="#ea580c" strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Emotion timeline (Phase 5) */}
          {emotionTrend.length > 0 && (
            <Card>
              <CardHeader title="Emotion timeline" subtitle="Confidence vs stress per question" />
              <CardBody>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={emotionTrend} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="t" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Line type="monotone" dataKey="confidence" name="Confidence" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="stress" name="Stress" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Answers */}
          <Card>
            <CardHeader title="Interview answers" subtitle="AI evaluation per question" />
            <CardBody className="space-y-4">
              {answered.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-ink-500">
                  <Clock className="h-4 w-4 text-ink-400" />
                  {interview ? 'Interview in progress — no scored answers yet.' : 'This candidate hasn’t taken the AI interview yet.'}
                </div>
              ) : (
                answered.map((q) => (
                  <div key={q.order} className="rounded-lg border border-ink-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="flex items-start gap-2 text-sm font-medium text-ink-900">
                        <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                        <span>
                          Q{q.order}. {q.text}
                          {q.source === 'hr' && (
                            <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                              your question
                            </span>
                          )}
                        </span>
                      </p>
                      <Badge tone={q.score >= passThreshold ? 'green' : q.score >= 50 ? 'amber' : 'red'}>
                        {q.score ?? 0}%
                      </Badge>
                    </div>
                    {q.answer && <p className="mt-2 pl-6 text-sm text-ink-600">“{q.answer}”</p>}
                    {q.feedback && <p className="mt-2 pl-6 text-xs text-ink-500">{q.feedback}</p>}
                    {q.mode === 'text' && (
                      <span className="mt-2 ml-6 inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                        <Type className="h-3.5 w-3.5" /> Answered in text{q.reason ? ` — reason: ${q.reason}` : ''}
                        {q.hardship && ' (exception — you required spoken answers)'}
                      </span>
                    )}
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          {/* What the candidate said outside their answers. Never scored — it
              is here because how someone engages is worth seeing, not because
              it earns them marks. */}
          {candidateTurns.length > 0 && (
            <Card>
              <CardHeader
                title="Candidate's questions & remarks"
                subtitle="Raised during the interview — not part of the score"
              />
              <CardBody className="space-y-3">
                {interview?.engagement?.note && (
                  <p className="rounded-lg bg-ink-50 px-3 py-2 text-xs leading-relaxed text-ink-600">
                    {interview.engagement.note}
                  </p>
                )}
                {candidateTurns.map((t, i) => (
                  <div key={i} className="rounded-lg border border-ink-100 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-ink-800">“{t.text}”</p>
                      <Badge tone={t.intent === 'issue' ? 'amber' : 'gray'}>
                        {t.intent === 'issue' ? 'reported an issue'
                          : t.intent === 'clarification' ? 'asked to clarify'
                          : 'question'}
                      </Badge>
                    </div>
                    {t.reply && (
                      <p className="mt-2 border-l-2 border-ink-100 pl-3 text-xs leading-relaxed text-ink-500">
                        {t.reply}
                      </p>
                    )}
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card>
            <CardBody className="flex flex-col items-center text-center">
              <Ring value={overall} size={104} label="overall" />
              <p className="mt-3 text-sm text-ink-500">AI recommendation</p>
              <p className="text-lg font-bold text-ink-900">{recommendation}</p>
              {interview?.verdict && (
                <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-xs leading-relaxed text-ink-600">
                  {interview.verdict}
                </p>
              )}
            </CardBody>
          </Card>

          {/* Strengths / improvements from the interview summary */}
          {(interview?.strengths?.length > 0 || interview?.improvements?.length > 0) && (
            <Card>
              <CardHeader title="Highlights" />
              <CardBody className="space-y-2">
                {(interview.strengths || []).map((t, i) => (
                  <div key={`s${i}`} className="flex items-start gap-2 text-sm text-ink-600">
                    <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {t}
                  </div>
                ))}
                {(interview.improvements || []).map((t, i) => (
                  <div key={`i${i}`} className="flex items-start gap-2 text-sm text-ink-600">
                    <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> {t}
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Verification" />
            <CardBody className="space-y-3">
              {/* Text answers is real; face/voice land in Phase 5/6. */}
              <VerifyRow
                icon={Type}
                label="Text answers"
                value={textAnswers.length > 0 ? `${textAnswers.length} used` : 'None'}
                tone={textAnswers.length > 0 ? 'warn' : 'ok'}
              />
              {faceMatch != null ? (
                <VerifyRow icon={ScanFace} label="Face match" value={`${faceMatch}%`} tone={faceMatch >= 40 ? 'ok' : 'warn'} />
              ) : (
                <VerifyRow icon={ScanFace} label="Face match" value="No face data" tone="pending" />
              )}
              {faceFlags > 0 && (
                <VerifyRow icon={AlertTriangle} label="Identity flags" value={String(faceFlags)} tone="warn" />
              )}
              {voiceMatch != null ? (
                <VerifyRow icon={Mic} label="Voice match" value={`${voiceMatch}%`} tone={voiceMatch >= 60 ? 'ok' : 'warn'} />
              ) : (
                <VerifyRow icon={Mic} label="Voice match" value="No voice data" tone="pending" />
              )}
              {voiceFlags > 0 && (
                <VerifyRow icon={AlertTriangle} label="Voice flags" value={String(voiceFlags)} tone="warn" />
              )}
              {screenRequired && (
                <VerifyRow
                  icon={MonitorUp}
                  label="Screen share"
                  value={
                    screenFlags === 0
                      ? 'Unbroken'
                      : `${screenFlags} interruption${screenFlags === 1 ? '' : 's'}` +
                        (screenGap > 0 ? ` (${formatGap(screenGap)})` : '')
                  }
                  tone={screenFlags === 0 ? 'ok' : 'warn'}
                />
              )}
              {gazeAwayPct != null && (
                <VerifyRow
                  icon={Eye}
                  label="Looking at screen"
                  value={`${100 - gazeAwayPct}% of samples`}
                  tone={gazeAwayPct >= 55 ? 'warn' : 'ok'}
                />
              )}
            </CardBody>
          </Card>

          {/* Who was actually on camera. Until this existed the report showed
              the candidate's own uploaded profile photo beside an identity
              score computed from frames nobody could see — so an employer
              could neither confirm a match nor question a mismatch. */}
          {faceShots.length > 0 && (
            <Card>
              <CardHeader
                title="Who took this interview"
                subtitle={
                  violationShots.length
                    ? `${faceShots.length} webcam stills — ${violationShots.length} captured at a warning`
                    : `${faceShots.length} webcam stills from the interview`
                }
              />
              <CardBody>
                {/* Profile photo beside the first frame of the interview: the
                    single comparison an employer most wants to make, side by
                    side rather than from a number. */}
                {referenceShot && (
                  <div className="mb-4 flex flex-wrap items-start gap-4 rounded-xl border border-ink-200 bg-ink-50 p-3">
                    <div className="text-center">
                      {c.photoUrl && !photoBroken ? (
                        <img
                          src={c.photoUrl}
                          alt="Profile"
                          onError={() => setPhotoBroken(true)}
                          className="h-24 w-24 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-ink-200 text-lg font-bold text-ink-600">
                          {initials(c.name)}
                        </div>
                      )}
                      <p className="mt-1 text-[11px] font-medium text-ink-500">Profile photo</p>
                    </div>
                    <div className="text-center">
                      <a href={referenceShot.url} target="_blank" rel="noreferrer">
                        <img
                          src={referenceShot.url}
                          alt="First frame of the interview"
                          className="h-24 w-24 rounded-lg object-cover transition hover:opacity-90"
                        />
                      </a>
                      <p className="mt-1 text-[11px] font-medium text-ink-500">On camera</p>
                    </div>
                    {referenceShot.matchScore != null && (
                      <div className="flex-1 self-center">
                        <Badge tone={referenceShot.matched === false ? 'red' : 'green'}>
                          {referenceShot.matchScore}% identity match
                        </Badge>
                        <p className="mt-1.5 text-xs text-ink-500">
                          {referenceShot.matched === false
                            ? 'The person on camera did not match the profile photo.'
                            : 'The person on camera matched the profile photo.'}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {faceShots.map((s, i) => {
                    const flagged = s.kind === 'violation'
                    return (
                      <a
                        key={i}
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        title={
                          flagged
                            ? `Captured when "${(s.violationType || '').replace(/_/g, ' ')}" was detected`
                            : 'Open full size'
                        }
                        className={cn(
                          'relative overflow-hidden rounded-lg border-2 transition',
                          flagged ? 'border-red-400' : 'border-ink-200 hover:border-ink-300'
                        )}
                      >
                        <img
                          src={s.url}
                          alt={`Candidate at ${s.atSeconds}s`}
                          loading="lazy"
                          className="aspect-square w-full object-cover"
                        />
                        <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[10px] font-medium text-white">
                          {Math.floor((s.atSeconds || 0) / 60)}m
                          {String((s.atSeconds || 0) % 60).padStart(2, '0')}s
                          {s.matchScore != null ? ` · ${s.matchScore}%` : ''}
                        </span>
                        {flagged && (
                          <span className="absolute right-1 top-1 rounded bg-red-600 px-1 py-0.5 text-[9px] font-bold text-white">
                            {(s.violationType || 'flag').replace(/_/g, ' ')}
                          </span>
                        )}
                      </a>
                    )
                  })}
                </div>

                {violationShots.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t border-ink-100 pt-3">
                    {violationShots.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-ink-600">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                        <span>
                          <strong className="text-ink-800">
                            {Math.floor((s.atSeconds || 0) / 60)}m
                            {String((s.atSeconds || 0) % 60).padStart(2, '0')}s
                          </strong>
                          {' — '}
                          {(s.violationType || '').replace(/_/g, ' ')}
                          {s.order ? ` (during question ${s.order})` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          )}

          {/* Screen timeline. Every capture is here, not only the flagged ones:
              an employer judging someone on a flag deserves to see the screen
              around it, and the clean shots are what make the flagged ones
              mean something. */}
          {screenshots.length > 0 && (
            <Card>
              <CardHeader
                title="Shared screen"
                subtitle={
                  flaggedShots.length
                    ? `${screenshots.length} captures — ${flaggedShots.length} flagged`
                    : `${screenshots.length} captures — nothing flagged`
                }
              />
              <CardBody>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {screenshots.map((s, i) => {
                    const flagged = (s.findings || []).length > 0
                    return (
                      <a
                        key={i}
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        title={
                          flagged
                            ? s.findings.map((f) => `${f.type}: ${f.note}`).join('\n')
                            : 'Open full size'
                        }
                        className={cn(
                          'group relative overflow-hidden rounded-lg border-2 transition',
                          flagged ? 'border-red-400' : 'border-ink-200 hover:border-ink-300'
                        )}
                      >
                        <img
                          src={s.url}
                          alt={`Screen at ${s.atSeconds}s`}
                          loading="lazy"
                          className="aspect-video w-full object-cover object-top"
                        />
                        <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          Q{s.order || '—'} · {Math.floor((s.atSeconds || 0) / 60)}m
                          {String((s.atSeconds || 0) % 60).padStart(2, '0')}s
                        </span>
                        {flagged && (
                          <span className="absolute right-1 top-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {s.findings[0].type.replace('_', ' ')}
                          </span>
                        )}
                      </a>
                    )
                  })}
                </div>
                {flaggedShots.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t border-ink-100 pt-3">
                    {flaggedShots.map((s, i) =>
                      s.findings.map((f, j) => (
                        <li key={`${i}-${j}`} className="flex items-start gap-2 text-xs text-ink-600">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                          <span>
                            <strong>{f.type.replace('_', ' ')}</strong> at{' '}
                            {Math.floor((s.atSeconds || 0) / 60)}m
                            {String((s.atSeconds || 0) % 60).padStart(2, '0')}s — {f.note}{' '}
                            <span className="text-ink-400">({f.confidence}% confidence)</span>
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="HR notes" subtitle="Private to your team — the candidate never sees these" />
            <CardBody>
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add a private note…"
                maxLength={4000}
                className="input-base resize-none"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-xs text-ink-400">
                  {savedAt ? `Last saved ${shortDate(savedAt)}` : 'Not saved yet'}
                </p>
                <Button
                  size="sm"
                  onClick={saveNotes}
                  disabled={savingNotes || notes === savedNotes}
                >
                  {savingNotes ? <Spinner size={14} /> : null} Save note
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}

function VerifyRow({ icon: Icon, label, value, tone }) {
  const color = tone === 'ok' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : 'text-ink-400'
  const Mark = tone === 'ok' ? Check : tone === 'warn' ? AlertTriangle : Clock
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-sm text-ink-600">
        <Icon className="h-4 w-4 text-ink-400" /> {label}
      </span>
      <span className={`flex items-center gap-1 text-xs font-semibold ${color}`}>
        <Mark className="h-3.5 w-3.5" /> {value}
      </span>
    </div>
  )
}

// How long the interview ran without the required screen share.
function formatGap(seconds) {
  if (seconds < 60) return `${seconds}s unshared`
  const m = Math.floor(seconds / 60)
  return `${m}m ${seconds % 60}s unshared`
}
