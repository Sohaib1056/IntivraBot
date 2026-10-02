import { CheckCircle2, Flag } from 'lucide-react'

const SKILLS = ['React', 'Node.js', 'MongoDB', 'Python']

/** Candidate: a CV being scanned — skills pop out, match ring fills. */
export function CvScan() {
  return (
    <div className="relative flex h-36 items-center justify-between gap-3 overflow-hidden rounded-2xl border border-brand-100 bg-brand-50 p-4" aria-hidden="true">
      {/* the CV */}
      <div className="relative h-32 w-20 shrink-0 overflow-hidden rounded-lg border border-brand-200 bg-white p-2 sm:w-24">
        <div className="flex items-center gap-1.5">
          <span className="h-5 w-5 rounded-full bg-brand-200" />
          <span className="h-1.5 flex-1 rounded bg-ink-300" />
        </div>
        {[90, 70, 85, 60, 95, 50, 75].map((w, i) => (
          <span key={i} className="mt-2 block h-1 rounded bg-ink-200" style={{ width: `${w}%` }} />
        ))}
        <span className="mg-beam absolute inset-x-0 h-10 border-b-2 border-brand-600 bg-brand-100" />
      </div>

      {/* extracted skills */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {SKILLS.map((s, i) => (
          <span
            key={s}
            className="mg-chip inline-flex w-fit items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-ink-700 ring-1 ring-brand-100"
            style={{ '--d': `${400 + i * 220}ms` }}
          >
            <CheckCircle2 className="h-3 w-3 text-brand-600" /> {s}
          </span>
        ))}
      </div>

      {/* match ring */}
      <div className="relative h-16 w-16 shrink-0 sm:h-20 sm:w-20">
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="#ffedd5" strokeWidth="3.5" />
          <circle
            className="mg-ring"
            cx="18" cy="18" r="15" fill="none" stroke="#ea580c" strokeWidth="3.5" strokeLinecap="round"
            pathLength="100" strokeDasharray="100" strokeDashoffset="8"
            style={{ '--d': '1300ms' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="mg-count text-base font-semibold text-ink-900 sm:text-lg" style={{ '--mg-n': 92, '--d': '1300ms' }} />
          <span className="text-[9px] font-semibold uppercase text-ink-400">match</span>
        </div>
      </div>
    </div>
  )
}

const RANKS = [
  { name: 'Sohaib', score: 94, color: 'bg-brand-500' },
  { name: 'Husnain', score: 88, color: 'bg-brand-400' },
  { name: 'Talha', score: 71, color: 'bg-brand-300', flag: true },
]

/** HR: a ranked board — rows slide in, scores grow, the top one gets stamped. */
export function RankBoard() {
  return (
    <div className="relative flex h-40 flex-col justify-end gap-1.5 overflow-hidden rounded-2xl border border-brand-100 bg-brand-50 p-3 pt-6" aria-hidden="true">
      {RANKS.map((r, i) => (
        <div
          key={r.name}
          className="mg-slide-r relative flex items-center gap-2.5 rounded-lg bg-white px-2.5 py-1 ring-1 ring-brand-100"
          style={{ '--d': `${200 + i * 150}ms` }}
        >
          <span className="w-3 text-[11px] font-bold text-ink-400">{i + 1}</span>
          <span className={`h-5 w-5 shrink-0 rounded-full ${r.color}`} />
          <span className="w-16 shrink-0 truncate text-[11px] font-semibold text-ink-700">{r.name}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
            <div className="mg-grow h-full rounded-full bg-brand-500" style={{ width: `${r.score}%`, '--d': `${700 + i * 150}ms` }} />
          </div>
          <span className="w-6 text-right text-[11px] font-bold text-ink-900">{r.score}</span>
          {r.flag && (
            <span className="mg-pop absolute -top-2 right-10 inline-flex items-center gap-0.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[9px] font-bold text-brand-700 ring-1 ring-brand-300" style={{ '--d': '1800ms' }}>
              <Flag className="h-2.5 w-2.5" /> Flag
            </span>
          )}
        </div>
      ))}
      <span
        className="mg-stamp absolute right-4 top-1 rotate-[-6deg] rounded-md border-2 border-brand-600 bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700"
        style={{ '--d': '2000ms' }}
      >
        Shortlisted
      </span>
    </div>
  )
}
