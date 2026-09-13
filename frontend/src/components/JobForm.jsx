import { useState } from 'react'
import { Plus, X, Wallet, ListChecks, Info, AlertTriangle } from 'lucide-react'
import { Card, CardHeader, CardBody } from './ui/Card'
import { Input, Textarea, Select } from './ui/Input'
import Button from './ui/Button'
import Spinner from './ui/Spinner'
import { cn } from '../lib/cn'
import { formatSalary, toDateInput } from '../lib/job'
import { useToast } from '../context/ToastContext'

/**
 * The job posting form, shared by Post Job and Edit Job so the two can't drift
 * apart — a field added here shows up in both.
 *
 * `initial` prefills it (an existing job, or the HR's hiring defaults);
 * `onSubmit` receives the assembled payload and does the create/update call.
 */

const BENEFIT_SUGGESTIONS = [
  'Health insurance', 'Provident fund', 'Annual bonus', 'Paid time off',
  'Flexible hours', 'Work from home', 'Training budget', 'Gym membership',
  'Transport allowance', 'Meal allowance', 'Laptop provided', 'Stock options',
]

/** A removable pill list fed by a text input. */
function TagInput({ value, onChange, placeholder, suggestions, max = 30 }) {
  const [text, setText] = useState('')
  const toast = useToast()

  const add = (raw) => {
    const s = (raw ?? text).trim()
    if (!s) return
    if (value.length >= max) return toast.error(`You can add up to ${max}.`)
    if (!value.some((x) => x.toLowerCase() === s.toLowerCase())) onChange([...value, s])
    setText('')
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add()
            }
          }}
          placeholder={placeholder}
          className="input-base"
        />
        <Button variant="secondary" onClick={() => add()} disabled={!text.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {suggestions?.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {suggestions
            .filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()))
            .map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className="rounded-full border border-dashed border-ink-300 px-2.5 py-1 text-xs font-medium text-ink-500 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
              >
                + {s}
              </button>
            ))}
        </div>
      )}

      {value.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {value.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
              {s}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== s))} aria-label={`Remove ${s}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** An ordered bullet list — one line of text per row. */
function BulletList({ label, hint, value, onChange, placeholder, max = 20, maxLength = 300 }) {
  const [text, setText] = useState('')
  const toast = useToast()

  const add = () => {
    const s = text.trim()
    if (!s) return
    if (value.length >= max) return toast.error(`You can add up to ${max} items.`)
    onChange([...value, s])
    setText('')
  }

  return (
    <div>
      <label className="label-base">{label}</label>
      {hint && <p className="-mt-1 mb-2 text-xs text-ink-400">{hint}</p>}
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder={placeholder}
          maxLength={maxLength}
          className="input-base"
        />
        <Button variant="secondary" onClick={add} disabled={!text.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {value.length > 0 && (
        <ul className="mt-3 space-y-2">
          {value.map((item, i) => (
            <li key={item} className="flex items-start gap-2 rounded-lg border border-ink-200 bg-ink-50/50 p-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">
                {i + 1}
              </span>
              <p className="flex-1 text-sm text-ink-700">{item}</p>
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== item))}
                aria-label="Remove item"
                className="text-ink-400 transition hover:text-red-600"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function JobForm({
  initial = {},
  onSubmit,
  onCancel,
  submitLabel = 'Publish job',
  savingLabel = 'Publishing…',
  showStatus = false,
}) {
  const toast = useToast()

  const [form, setForm] = useState({
    title: initial.title || '',
    location: initial.location || '',
    type: initial.type || 'Full-time',
    workMode: initial.workMode || 'Onsite',
    department: initial.department || '',
    experience: initial.experience || '1-3 years',
    education: initial.education || '',
    openings: initial.openings ?? 1,
    deadline: toDateInput(initial.deadline),
    description: initial.description || '',
    status: initial.status || 'open',
  })

  // Salary is held as strings so the inputs can be cleared; converted on submit.
  const [pay, setPay] = useState({
    salaryMin: initial.salaryMin ?? '',
    salaryMax: initial.salaryMax ?? '',
    salaryCurrency: initial.salaryCurrency || 'PKR',
    salaryPeriod: initial.salaryPeriod || 'month',
    salaryDisclosed: initial.salaryDisclosed ?? true,
    salaryNegotiable: initial.salaryNegotiable ?? false,
  })

  const [skills, setSkills] = useState(initial.skills || [])
  const [niceToHave, setNiceToHave] = useState(initial.niceToHaveSkills || [])
  const [benefits, setBenefits] = useState(initial.benefits || [])
  const [responsibilities, setResponsibilities] = useState(initial.responsibilities || [])
  const [requirements, setRequirements] = useState(initial.requirements || [])

  const [applyT, setApplyT] = useState(initial.applyThreshold ?? 70)
  const [passT, setPassT] = useState(initial.passThreshold ?? 80)
  const [saving, setSaving] = useState(false)

  // Questions this HR wants asked verbatim in every interview for this job.
  const [questions, setQuestions] = useState(initial.customQuestions || [])
  const [questionInput, setQuestionInput] = useState('')
  const [questionCount, setQuestionCount] = useState(initial.questionCount ?? 5)
  const [minutesPerQuestion, setMinutesPerQuestion] = useState(initial.minutesPerQuestion ?? 4)
  const [language, setLanguage] = useState(initial.language ?? 'English')
  // How the interview is conducted. These are the employer's call, not the
  // candidate's — a candidate who could switch to typing at will would be
  // opting out of the voice check that verifies who is answering.
  const [allowTextAnswers, setAllowTextAnswers] = useState(initial.allowTextAnswers ?? true)
  const [requireScreenShare, setRequireScreenShare] = useState(initial.requireScreenShare ?? true)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setPayField = (k) => (e) =>
    setPay((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const addQuestion = () => {
    const q = questionInput.trim()
    if (q.length < 5) return toast.error('That question is too short.')
    if (questions.length >= 10) return toast.error('You can add up to 10 questions.')
    if (questions.some((x) => x.toLowerCase() === q.toLowerCase())) return
    setQuestions([...questions, q])
    setQuestionInput('')
  }

  // Live preview of exactly what candidates will read on the job card.
  const salaryPreview = formatSalary({
    ...pay,
    salaryMin: pay.salaryMin === '' ? null : Number(pay.salaryMin),
    salaryMax: pay.salaryMax === '' ? null : Number(pay.salaryMax),
  })

  const submit = async () => {
    if (form.title.trim().length < 3) return toast.error('Please enter a job title.')
    if (form.description.trim().length < 10) return toast.error('Please write a longer description.')
    if (skills.length === 0) return toast.error('Add at least one required skill.')
    if (passT < applyT) return toast.error('Pass threshold must be ≥ apply threshold.')

    const min = pay.salaryMin === '' ? null : Number(pay.salaryMin)
    const max = pay.salaryMax === '' ? null : Number(pay.salaryMax)
    if (min != null && max != null && max < min) {
      return toast.error('Maximum salary must be greater than or equal to the minimum.')
    }
    // The API rejects a past deadline; catch it here so the HR isn't bounced
    // back with a server error after filling in the whole form.
    if (form.deadline && new Date(`${form.deadline}T23:59:59`).getTime() < Date.now()) {
      return toast.error('The application deadline must be in the future.')
    }

    setSaving(true)
    try {
      await onSubmit({
        title: form.title.trim(),
        location: form.location.trim() || 'Remote',
        type: form.type,
        workMode: form.workMode,
        department: form.department.trim(),
        experience: form.experience,
        education: form.education,
        openings: Number(form.openings) || 1,
        // Land on the end of the chosen day, so "closes on the 30th" includes it.
        deadline: form.deadline ? new Date(`${form.deadline}T23:59:59`).toISOString() : null,
        description: form.description.trim(),
        skills,
        niceToHaveSkills: niceToHave,
        benefits,
        responsibilities,
        requirements,
        salaryMin: min,
        salaryMax: max,
        salaryCurrency: pay.salaryCurrency,
        salaryPeriod: pay.salaryPeriod,
        salaryDisclosed: pay.salaryDisclosed,
        salaryNegotiable: pay.salaryNegotiable,
        applyThreshold: applyT,
        passThreshold: passT,
        customQuestions: questions,
        // Always leave room for the warm-up plus every HR question.
        questionCount: Math.max(questionCount, questions.length + 1),
        minutesPerQuestion,
        language,
        allowTextAnswers,
        requireScreenShare,
        ...(showStatus ? { status: form.status } : {}),
      })
    } catch {
      // onSubmit surfaces its own error; just re-enable the button.
      setSaving(false)
    }
  }

  return (
    // Two columns on desktop: the long-form copy the candidate reads on the
    // left, the scoring controls the HR tunes on the right. Collapses to one
    // column below lg, where a single stack is easier to fill in.
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
      <Card>
        <CardHeader title="Job details" subtitle="The basics candidates see first" />
        <CardBody className="space-y-4">
          <Input label="Job title" placeholder="e.g. Frontend Developer (React)" value={form.title} onChange={set('title')} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Location" placeholder="e.g. Lahore / Remote" value={form.location} onChange={set('location')} />
            <Input
              label="Department"
              placeholder="e.g. Engineering"
              value={form.department}
              maxLength={80}
              hint="Optional — groups the role on your dashboard."
              onChange={set('department')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Job type" value={form.type} onChange={set('type')}>
              <option>Full-time</option>
              <option>Part-time</option>
              <option>Contract</option>
              <option>Internship</option>
            </Select>
            <Select label="Work mode" value={form.workMode} onChange={set('workMode')}>
              <option>Onsite</option>
              <option>Hybrid</option>
              <option>Remote</option>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Experience level" value={form.experience} onChange={set('experience')}>
              <option>0-1 years</option>
              <option>1-3 years</option>
              <option>3-5 years</option>
              <option>5+ years</option>
            </Select>
            <Select label="Minimum education" value={form.education} onChange={set('education')}>
              <option value="">No specific requirement</option>
              <option>Matric</option>
              <option>Intermediate</option>
              <option>Diploma</option>
              <option>Bachelors</option>
              <option>Masters</option>
              <option>PhD</option>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Number of openings"
              type="number"
              min={1}
              max={999}
              value={form.openings}
              onChange={set('openings')}
            />
            <Input
              label="Application deadline"
              type="date"
              value={form.deadline}
              min={toDateInput(Date.now() + 86400000)}
              hint="Optional — applications close automatically after this date."
              onChange={set('deadline')}
            />
          </div>

          {showStatus && (
            <Select label="Status" value={form.status} onChange={set('status')}>
              <option value="open">Open — accepting applications</option>
              <option value="closed">Closed — no new applications</option>
              <option value="draft">Draft — hidden from candidates</option>
            </Select>
          )}

          <Textarea label="Description" placeholder="Write about the role…" rows={4} value={form.description} onChange={set('description')} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={<span className="flex items-center gap-2"><Wallet className="h-4 w-4 text-brand-600" /> Salary &amp; benefits</span>}
          subtitle="Posts that state a salary get noticeably more applicants"
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Currency" value={pay.salaryCurrency} onChange={setPayField('salaryCurrency')}>
              <option value="PKR">PKR — Pakistani Rupee</option>
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="GBP">GBP — British Pound</option>
              <option value="AED">AED — UAE Dirham</option>
              <option value="SAR">SAR — Saudi Riyal</option>
              <option value="INR">INR — Indian Rupee</option>
            </Select>
            <Select label="Per" value={pay.salaryPeriod} onChange={setPayField('salaryPeriod')}>
              <option value="month">Per month</option>
              <option value="year">Per year</option>
              <option value="hour">Per hour</option>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Minimum"
              type="number"
              min={0}
              placeholder="e.g. 80000"
              value={pay.salaryMin}
              onChange={setPayField('salaryMin')}
            />
            <Input
              label="Maximum"
              type="number"
              min={0}
              placeholder="e.g. 150000"
              value={pay.salaryMax}
              onChange={setPayField('salaryMax')}
            />
          </div>

          {/* What the candidate will actually read */}
          <div className={cn(
            'flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm',
            salaryPreview ? 'bg-brand-50 text-brand-800' : 'bg-ink-50 text-ink-500'
          )}>
            <Info className="h-4 w-4 shrink-0" />
            {salaryPreview ? (
              <span>
                Candidates will see <span className="font-semibold">{salaryPreview}</span>
                {pay.salaryNegotiable && ' · Negotiable'}
              </span>
            ) : pay.salaryDisclosed ? (
              <span>No salary entered — the job will show &ldquo;Not disclosed&rdquo;.</span>
            ) : (
              <span>Salary hidden — the job will show &ldquo;Market competitive&rdquo;.</span>
            )}
          </div>

          <div className="space-y-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink-200 p-3 transition hover:bg-ink-50">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-100"
                checked={pay.salaryDisclosed}
                onChange={setPayField('salaryDisclosed')}
              />
              <span>
                <span className="block text-sm font-semibold text-ink-900">Show the salary to candidates</span>
                <span className="mt-0.5 block text-xs text-ink-500">
                  Untick to keep the range internal — it is still saved for your own reporting.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink-200 p-3 transition hover:bg-ink-50">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-100"
                checked={pay.salaryNegotiable}
                onChange={setPayField('salaryNegotiable')}
              />
              <span>
                <span className="block text-sm font-semibold text-ink-900">Salary is negotiable</span>
                <span className="mt-0.5 block text-xs text-ink-500">
                  Shown alongside the range for the right candidate.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label className="label-base">Benefits &amp; perks</label>
            <TagInput
              value={benefits}
              onChange={setBenefits}
              placeholder="Type a benefit and press Enter"
              suggestions={BENEFIT_SUGGESTIONS}
              max={15}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Required skills" subtitle="AI matches candidate CVs against these" />
        <CardBody className="space-y-5">
          <div>
            <label className="label-base">Must-have skills</label>
            <p className="-mt-1 mb-2 text-xs text-ink-400">
              These decide the match score. Spelling need not be exact — &ldquo;React JS&rdquo; matches a CV saying &ldquo;React.js&rdquo;.
            </p>
            <TagInput value={skills} onChange={setSkills} placeholder="Type a skill and press Enter" />
          </div>

          <div>
            <label className="label-base">Nice to have</label>
            <p className="-mt-1 mb-2 text-xs text-ink-400">
              Shown to candidates but not counted against their score.
            </p>
            <TagInput value={niceToHave} onChange={setNiceToHave} placeholder="e.g. Docker, GraphQL" />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={<span className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-brand-600" /> Responsibilities &amp; requirements</span>}
          subtitle="Optional — a clearer post attracts better-fitting applicants"
        />
        <CardBody className="space-y-5">
          <BulletList
            label="What they'll do"
            hint="One responsibility per line."
            value={responsibilities}
            onChange={setResponsibilities}
            placeholder="e.g. Build and ship features across the stack"
          />
          <BulletList
            label="What you're looking for"
            hint="Qualifications and expectations beyond the skill list."
            value={requirements}
            onChange={setRequirements}
            placeholder="e.g. Experience leading a small team"
          />
        </CardBody>
      </Card>
      </div>

      {/* Right rail: everything that tunes scoring and the interview. Sticks
          while the longer left column scrolls. */}
      <div className="space-y-6 lg:sticky lg:top-6">
      <Card>
        <CardHeader
          title="Interview questions"
          subtitle="AI writes the rest — add any you want asked word for word"
        />
        <CardBody className="space-y-4">
          <div className="flex gap-2">
            <input
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addQuestion())}
              placeholder="e.g. Why do you want to work at our company?"
              maxLength={300}
              className="input-base"
            />
            <Button variant="secondary" onClick={addQuestion}><Plus className="h-4 w-4" /></Button>
          </div>

          {/* Your own questions are asked word for word and are never shortened,
              so the only useful thing to do is tell you while you are typing.
              The candidate hears this once — past about 25 words they end up
              reconstructing the question instead of answering it. */}
          {(() => {
            const words = questionInput.trim().split(/\s+/).filter(Boolean).length
            if (words <= 25) return null
            return (
              <p className="flex items-start gap-1.5 text-xs text-amber-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                That is {words} words. Candidates hear this once — under 25 words is
                easier to answer well. Yours is asked exactly as written either way.
              </p>
            )
          })()}

          {questions.length > 0 && (
            <ol className="space-y-2">
              {questions.map((q, i) => (
                <li key={q} className="flex items-start gap-2 rounded-lg border border-ink-200 bg-ink-50/50 p-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                    {i + 1}
                  </span>
                  <p className="flex-1 text-sm text-ink-700">{q}</p>
                  <button
                    onClick={() => setQuestions(questions.filter((x) => x !== q))}
                    aria-label="Remove question"
                    className="text-ink-400 transition hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ol>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="label-base mb-0">Total questions</label>
                <span className="text-sm font-bold text-brand-600">
                  {Math.max(questionCount, questions.length + 1)}
                </span>
              </div>
              <input
                type="range"
                min="3"
                max="15"
                value={questionCount}
                onChange={(e) => setQuestionCount(+e.target.value)}
                className="w-full accent-brand-600"
              />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="label-base mb-0">Minutes per question</label>
                <span className="text-sm font-bold text-brand-600">
                  {minutesPerQuestion} min
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="15"
                value={minutesPerQuestion}
                onChange={(e) => setMinutesPerQuestion(+e.target.value)}
                className="w-full accent-brand-600"
              />
            </div>
          </div>

          {/* The number that actually matters to a candidate is the total, and
              it is the one thing neither slider shows on its own. */}
          <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
            Candidates get{' '}
            <strong className="font-semibold text-ink-900">
              {Math.max(questionCount, questions.length + 1) * minutesPerQuestion} minutes
            </strong>{' '}
            in total. The limit covers the whole interview, not each answer.{' '}
            {questions.length === 0
              ? 'All questions will be AI-generated for this role and candidate.'
              : `Question 1 is a warm-up, then your ${questions.length} question${questions.length === 1 ? '' : 's'}, then AI fills the rest.`}
          </p>

          <div className="mt-4">
            <label className="label-base">Interview language</label>
            <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="English">English</option>
              <option value="Roman Urdu">Roman Urdu (Urdu in English letters)</option>
              <option value="Both">Both — mix of English and Roman Urdu</option>
              <option value="Urdu">اردو (Urdu script)</option>
            </Select>
            <p className="mt-1.5 text-xs text-ink-400">
              Questions are asked and answers expected in this language.{' '}
              <strong className="font-medium text-ink-500">Both</strong> lets the
              interviewer and the candidate switch between English and Roman Urdu
              mid-sentence — closest to how a real bilingual interview sounds, and
              neither choice is marked down.
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Interview conditions"
          subtitle="How candidates take this interview — only you can set these"
        />
        <CardBody className="space-y-3">
          <ToggleRow
            label="Allow typed answers"
            hint={
              allowTextAnswers
                ? 'Candidates may type instead of speaking. Typed answers skip the voice check and are flagged in the report.'
                : 'Answers must be spoken. A candidate with a genuine mic or hearing problem can still request an exception — it is accepted and flagged for you.'
            }
            checked={allowTextAnswers}
            onChange={setAllowTextAnswers}
          />
          <ToggleRow
            label="Require full screen share"
            hint={
              requireScreenShare
                ? 'Candidates must share their entire screen before the interview starts. Stopping it mid-interview is flagged.'
                : 'Candidates are not asked to share their screen.'
            }
            checked={requireScreenShare}
            onChange={setRequireScreenShare}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Thresholds" subtitle="Two gates: one to apply, one to pass" />
        <CardBody className="space-y-5">
          {/* Stacked, not side by side — the rail is too narrow for two sliders. */}
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="label-base mb-0">Apply threshold</label>
                <span className="text-sm font-bold text-brand-600">{applyT}%</span>
              </div>
              <input type="range" min="0" max="100" value={applyT} onChange={(e) => setApplyT(+e.target.value)} className="w-full accent-brand-600" />
              <p className="mt-1 text-xs text-ink-400">Candidates below this match can&apos;t apply.</p>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="label-base mb-0">Pass threshold</label>
                <span className="text-sm font-bold text-brand-600">{passT}%</span>
              </div>
              <input type="range" min="0" max="100" value={passT} onChange={(e) => setPassT(+e.target.value)} className="w-full accent-brand-600" />
              <p className="mt-1 text-xs text-ink-400">Candidates above this are auto-shortlisted.</p>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>
          {saving ? (<><Spinner size={18} /> {savingLabel}</>) : submitLabel}
        </Button>
      </div>
      </div>
    </div>
  )
}

// A labelled switch for the interview-conditions card. Written as a real
// checkbox so it keeps keyboard focus and screen-reader semantics for free.
function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-200 bg-ink-50/40 p-3 transition hover:border-ink-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full bg-ink-300 p-0.5 transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-2 peer-checked:bg-brand-600"
      >
        {/* Driven by `checked` rather than a peer- variant: the knob is a child
            of the track, not a sibling of the input, so peer-checked can't
            reach it. */}
        <span
          className={cn(
            'h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-4'
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink-900">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">{hint}</span>
      </span>
    </label>
  )
}
