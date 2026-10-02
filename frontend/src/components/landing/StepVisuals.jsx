import { FileText, UploadCloud, CheckCircle2, ScanFace, AudioLines, Fingerprint, Users, Bot, Mic } from 'lucide-react'
import { useInView } from './useInView'

// Every visual is self-triggering (mg-in when it enters the viewport, which
// also works inside the horizontally-translated track). Orange + white only.
function Stage({ children, className = '' }) {
  const [ref, mg] = useInView()
  return (
    <div ref={ref} className={`relative h-72 overflow-hidden rounded-2xl border border-brand-100 bg-brand-50 ${mg} ${className}`} aria-hidden="true">
      {children}
    </div>
  )
}

/** 01 Apply — a CV drops into the upload zone, gets parsed, scores. */
export function ApplyVisual() {
  return (
    <Stage>
      <div className="absolute inset-5 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-brand-300">
        <UploadCloud className="mg-pop h-7 w-7 text-brand-500" />
        <span className="mt-1 text-[11px] text-ink-400">Drop your CV here</span>
      </div>
      <div className="mg-drop absolute left-1/2 top-9 -ml-[110px] w-[220px] rounded-xl border border-brand-200 bg-white p-3" style={{ '--d': '300ms' }}>
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-600"><FileText className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold text-ink-900">Sohaib_CV.pdf</div>
            <div className="text-[10px] text-ink-400">248 KB · Parsing résumé…</div>
          </div>
        </div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-brand-100">
          <div className="mg-grow h-full rounded-full bg-brand-600" style={{ width: '100%', '--d': '900ms' }} />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1">
          {['React', 'Node.js', 'SQL', '3 yrs exp'].map((s, i) => (
            <span key={s} className="mg-chip rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700" style={{ '--d': `${1700 + i * 150}ms` }}>{s}</span>
          ))}
        </div>
      </div>
      <div className="mg-stamp absolute bottom-6 right-6 flex items-center gap-2 rounded-2xl bg-brand-600 px-3 py-2 text-white" style={{ '--d': '2400ms' }}>
        <CheckCircle2 className="h-4 w-4" />
        <span className="text-xs font-bold">ATS match <span className="mg-count" style={{ '--mg-n': 92, '--d': '2400ms' }} /></span>
      </div>
    </Stage>
  )
}

/** 02 Verify — face ring scans while the identity checklist ticks off. */
export function VerifyVisual() {
  const checks = [
    [ScanFace, 'Face match', '98%'],
    [AudioLines, 'Voice print', 'OK'],
    [Fingerprint, 'Liveness', 'OK'],
    [Users, 'Single person', 'OK'],
  ]
  return (
    <Stage>
      <div className="absolute left-6 top-1/2 h-36 w-36 -translate-y-1/2 sm:left-8">
        <div className="mg-spin absolute inset-0 rounded-full border-2 border-dashed border-brand-500" />
        <div className="mg-spin-rev absolute inset-3 rounded-full border border-brand-300" />
        <div className="absolute inset-6 overflow-hidden rounded-full bg-brand-500">
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
            <circle cx="50" cy="40" r="18" fill="#fdba74" />
            <path d="M18 100c3-24 16-34 32-34s29 10 32 34z" fill="#fdba74" />
            {/* face mesh */}
            <g stroke="#fff" strokeWidth="0.6" fill="#fff">
              {[[42, 34], [58, 34], [50, 42], [44, 50], [56, 50], [36, 40], [64, 40]].map(([x, y], i) => (
                <circle key={i} className="mg-pop" cx={x} cy={y} r="1.3" style={{ '--d': `${300 + i * 90}ms`, transformBox: 'fill-box', transformOrigin: 'center' }} />
              ))}
              <path className="mg-draw" d="M36 40 L42 34 L58 34 L64 40 L56 50 L44 50 Z M42 34 L50 42 L58 34 M44 50 L50 42 L56 50" fill="none" pathLength="100" strokeDasharray="100" strokeDashoffset="0" style={{ '--d': '900ms' }} />
            </g>
          </svg>
          <span className="mg-scanline absolute inset-x-0 top-1/2 h-0.5 bg-white" />
        </div>
      </div>
      <ul className="absolute right-5 top-1/2 w-[46%] -translate-y-1/2 space-y-2">
        {checks.map(([Icon, label, val], i) => (
          <li key={label} className="mg-chip flex items-center gap-2 rounded-xl border border-brand-100 bg-white px-2.5 py-2" style={{ '--d': `${600 + i * 350}ms` }}>
            <Icon className="h-3.5 w-3.5 shrink-0 text-brand-600" />
            <span className="flex-1 truncate text-[11px] font-medium text-ink-700">{label}</span>
            <span className="text-[10px] font-bold text-brand-600">{val}</span>
          </li>
        ))}
      </ul>
    </Stage>
  )
}

const METERS = [
  ['Confidence', 'bg-brand-600', '0ms'],
  ['Engagement', 'bg-brand-500', '400ms'],
  ['Stress', 'bg-brand-400', '800ms'],
]

/** 03 Interview — AI asks, candidate speaks, emotion meters move live. */
export function InterviewVisual() {
  return (
    <Stage>
      <div className="absolute inset-x-5 top-5 flex items-start gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white"><Bot className="h-4 w-4" /></span>
        <p className="mg-type rounded-2xl rounded-tl-sm border border-brand-100 bg-white px-3 py-2 text-xs text-ink-900" style={{ '--d': '300ms' }}>
          How would you scale an API to 1M users?
        </p>
      </div>
      <div className="absolute inset-x-5 top-[84px] flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-brand-600"><Mic className="h-4 w-4" /></span>
        <div className="mg-bars flex h-9 flex-1 items-center gap-[3px]">
          {Array.from({ length: 30 }, (_, i) => (
            <span key={i} className="flex-1 rounded-full bg-brand-500" style={{ height: 8 + ((i * 37) % 28), '--d': `${(i * 71) % 800}ms` }} />
          ))}
        </div>
      </div>
      <div className="absolute inset-x-5 bottom-5 space-y-2.5">
        {METERS.map(([label, fill, d]) => (
          <div key={label} className="flex items-center gap-3">
            <span className="w-20 text-[10px] font-semibold uppercase tracking-wide text-ink-700">{label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white">
              <div className={`mg-meter h-full rounded-full ${fill}`} style={{ '--d': d }} />
            </div>
          </div>
        ))}
      </div>
    </Stage>
  )
}

const BARS = [['Tech', 88], ['Comms', 76], ['Problem', 91], ['Culture', 70], ['Emotion', 84]]

/** 04 Report — score ring counts up, category bars rise, stamp lands. */
export function ReportVisual() {
  return (
    <Stage>
      <div className="absolute left-6 top-1/2 h-32 w-32 -translate-y-1/2">
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="#ffedd5" strokeWidth="3" />
          <circle className="mg-ring" cx="18" cy="18" r="15" fill="none" stroke="#ea580c" strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray="100" strokeDashoffset="14" style={{ '--d': '200ms' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="mg-count text-3xl font-semibold text-ink-900" style={{ '--mg-n': 86, '--d': '200ms' }} />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Overall</span>
        </div>
      </div>
      <div className="absolute bottom-6 right-6 top-12 flex w-[48%] items-end justify-between gap-2">
        {BARS.map(([label, v], i) => (
          <div key={label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="mg-pop text-[10px] font-bold text-ink-700" style={{ '--d': `${900 + i * 120}ms` }}>{v}</span>
            <div className="mg-rise-bar w-full rounded-t-md bg-brand-500" style={{ height: `${v * 0.8}%`, '--d': `${500 + i * 120}ms` }} />
            <span className="text-[8px] font-semibold uppercase text-ink-400">{label}</span>
          </div>
        ))}
      </div>
      <span className="mg-stamp absolute right-6 top-3 rotate-[-8deg] rounded-md border-2 border-brand-600 bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-brand-700" style={{ '--d': '1700ms' }}>
        Shortlisted
      </span>
    </Stage>
  )
}
