import { useLocation, Link } from 'react-router-dom'
import { TrendingUp, TrendingDown, CheckCircle2, XCircle, MessageSquare, Mic, Type, FileText, ArrowLeft, ChevronRight, Clock, AlertTriangle } from 'lucide-react'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Ring } from '../../components/ui/Progress'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Progress from '../../components/ui/Progress'
import Spinner from '../../components/ui/Spinner'
import { cn } from '../../lib/cn'
import EmptyState from '../../components/ui/EmptyState'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/useFetch'
import { shortDate } from '../../lib/format'

export default function Results() {
  const location = useLocation()
  const stateInterview = location.state?.interview
  const id = new URLSearchParams(location.search).get('id')

  // Two modes:
  //  - a specific report (router state after finishing, or ?id=… from a link)
  //  - no id → the candidate's list of past reports
  const wantsOne = Boolean(stateInterview || id)

  const { data, loading, error } = useFetch(
    () => {
      if (stateInterview) return Promise.resolve(null)
      return id ? api.get(`/interviews/${id}`) : api.get('/interviews/mine')
    },
    [id, !!stateInterview]
  )

  if (loading && !stateInterview) {
    return <div className="flex justify-center py-20 text-brand-600"><Spinner size={28} /></div>
  }

  if (wantsOne) {
    const interview = stateInterview || data?.interview
    if (!interview) {
      return (
        <EmptyState
          icon={FileText}
          title="Report not found"
          description={error || 'This interview report could not be loaded.'}
          action={<Button as={Link} to="/candidate/results">All my reports</Button>}
        />
      )
    }
    return <Report interview={interview} showBack />
  }

  return <ReportsList interviews={data?.interviews || []} error={error} />
}

// ── List of every interview this candidate has taken ──────────────────────────
function ReportsList({ interviews, error }) {
  if (error) {
    return <EmptyState icon={FileText} title="Couldn’t load your reports" description={error} />
  }
  if (interviews.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No interview report yet"
        description="Finish an AI interview and your scored report will appear here."
        action={<Button as={Link} to="/candidate/applications">My applications</Button>}
      />
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink-900">My Reports</h2>
        <p className="text-sm text-ink-500">
          {interviews.length} interview{interviews.length > 1 ? 's' : ''} — tap one to see the full breakdown
        </p>
      </div>

      <Card>
        <CardBody className="p-0">
          <div className="divide-y divide-ink-100">
            {interviews.map((iv) => {
              const done = iv.status === 'completed'
              const threshold = iv.job?.passThreshold ?? 60
              const score = iv.overallScore ?? 0
              const passed = done && score >= threshold
              return (
                <Link
                  key={iv._id}
                  to={`/candidate/results?id=${iv._id}`}
                  className="flex items-center gap-4 px-5 py-4 transition hover:bg-ink-50/60"
                >
                  {done ? (
                    <Ring value={score} size={54} />
                  ) : (
                    <span className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-amber-50 text-amber-600">
                      <Clock className="h-5 w-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink-900">{iv.job?.title || 'Interview'}</p>
                      {done ? (
                        passed ? (
                          <Badge tone="green"><CheckCircle2 className="h-3 w-3" /> Passed</Badge>
                        ) : (
                          <Badge tone="red"><XCircle className="h-3 w-3" /> Not passed</Badge>
                        )
                      ) : (
                        <Badge tone="amber">In progress</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-ink-500">
                      {iv.job?.company ? `${iv.job.company} · ` : ''}
                      {done && iv.completedAt
                        ? `Completed ${shortDate(iv.completedAt)}`
                        : `Started ${shortDate(iv.createdAt)}`}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-ink-300" />
                </Link>
              )
            })}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

function Report({ interview, showBack }) {
  const answered = (interview.questions || []).filter((q) => q.answer)
  const passThreshold = interview.job?.passThreshold ?? 60
  const overall = interview.overallScore ?? 0
  const passed = overall >= passThreshold

  const trend = answered.map((q, i) => ({ t: `Q${q.order || i + 1}`, score: q.score ?? 0 }))

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {showBack && (
        <Link to="/candidate/results" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-900">
          <ArrowLeft className="h-4 w-4" /> All my reports
        </Link>
      )}

      {/* Header card */}
      <div className="card-base p-6 sm:p-8">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-6">
            <Ring value={overall} size={104} label="overall" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-ink-900">Interview Report</h1>
                {passed ? (
                  <Badge tone="green"><CheckCircle2 className="h-3.5 w-3.5" /> Passed</Badge>
                ) : (
                  <Badge tone="red"><XCircle className="h-3.5 w-3.5" /> Not passed</Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-500">{interview.job?.title || 'Interview'}</p>
              {interview.completedAt && (
                <p className="mt-0.5 text-xs text-ink-400">Completed on {shortDate(interview.completedAt)}</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-ink-400">Pass threshold</p>
            <p className="text-lg font-semibold text-ink-900">{passThreshold}%</p>
          </div>
        </div>

        {/* Why the interview ended, when it did not end normally.
            A candidate whose interview closed itself used to see only a low
            score with no explanation anywhere — not on this page, not in the
            report. Being marked down without being told why is the one thing
            an assessment must never do. */}
        {interview.endedReason && interview.endedReason !== 'completed' && (
          <div
            className={cn(
              'mt-5 rounded-lg border p-4',
              interview.endedReason === 'violation'
                ? 'border-red-200 bg-red-50'
                : 'border-amber-200 bg-amber-50'
            )}
          >
            <p
              className={cn(
                'flex items-start gap-2 text-sm font-semibold',
                interview.endedReason === 'violation' ? 'text-red-900' : 'text-amber-900'
              )}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {interview.endedReason === 'violation'
                ? 'This interview was ended early'
                : interview.endedReason === 'timeout'
                  ? 'This interview ran out of time'
                  : 'This interview was closed because you left'}
            </p>
            <p
              className={cn(
                'mt-1.5 text-xs leading-relaxed',
                interview.endedReason === 'violation' ? 'text-red-800' : 'text-amber-800'
              )}
            >
              {interview.endedReason === 'violation'
                ? interview.terminatedFor ||
                  'A verification rule was broken during the interview.'
                : interview.endedReason === 'timeout'
                  ? 'The time limit was reached before the last question. Questions you did not reach counted as zero.'
                  : 'You were away from the interview for more than five minutes, so it was submitted automatically. Questions you did not reach counted as zero.'}
            </p>

            {/* The individual strikes, so "a rule was broken" is never the whole
                explanation the candidate gets. */}
            {(interview.violations || []).length > 0 && (
              <ol className="mt-3 space-y-1.5">
                {interview.violations.map((v, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-red-900">
                    <span className="mt-px shrink-0 rounded bg-red-200 px-1.5 py-0.5 text-[10px] font-bold">
                      {v.strike >= 2 ? 'Ended' : `Warning ${v.strike}`}
                    </span>
                    <span>
                      {v.detail}
                      {v.atSeconds != null && (
                        <span className="text-red-700/60">
                          {' '}({Math.floor(v.atSeconds / 60)}m {v.atSeconds % 60}s in)
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {interview.verdict && (
          <p className="mt-5 rounded-lg bg-ink-50 px-4 py-3 text-sm leading-relaxed text-ink-600">
            {interview.verdict}
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Per-question breakdown */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader title="Score by question" subtitle="How each answer was scored" />
            <CardBody className="space-y-4">
              {answered.map((q) => (
                <div key={q.order}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium text-ink-700">
                      Q{q.order}
                      {q.mode === 'text' ? (
                        <Type className="h-3.5 w-3.5 text-amber-500" />
                      ) : (
                        <Mic className="h-3.5 w-3.5 text-ink-400" />
                      )}
                    </span>
                    <span className="font-semibold text-ink-900">{q.score ?? 0}%</span>
                  </div>
                  <Progress value={q.score ?? 0} />
                  <p className="mt-1.5 text-xs text-ink-500">{q.text}</p>
                </div>
              ))}
            </CardBody>
          </Card>

          {trend.length > 1 && (
            <Card>
              <CardHeader title="Score across the interview" subtitle="Har sawal ka score trend" />
              <CardBody>
                <div className="h-56">
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

          {/* Per-answer feedback */}
          <Card>
            <CardHeader title="Answer feedback" subtitle="What the AI interviewer noted" />
            <CardBody className="space-y-4">
              {answered.map((q) => (
                <div key={q.order} className="rounded-lg border border-ink-100 p-3">
                  <div className="flex items-start gap-2 text-sm font-medium text-ink-800">
                    <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                    <span>Q{q.order}. {q.text}</span>
                  </div>
                  {q.feedback && <p className="mt-2 pl-6 text-xs text-ink-500">{q.feedback}</p>}
                  {q.reason && (
                    <p className="mt-2 pl-6 text-xs text-amber-600">Text mode used — reason: {q.reason}</p>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>
        </div>

        {/* Strengths / improvements */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Strengths" />
            <CardBody className="space-y-2">
              {(interview.strengths?.length ? interview.strengths : ['—']).map((t, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-ink-600">
                  <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {t}
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Areas to improve" />
            <CardBody className="space-y-2">
              {(interview.improvements?.length ? interview.improvements : ['—']).map((t, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-ink-600">
                  <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> {t}
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
