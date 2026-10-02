import { Bot, Mic, ScanFace, CheckCircle2, AudioLines } from 'lucide-react'
import { useInView } from './useInView'

// Waveform bar heights (px) — fixed so the shape reads as speech, not noise.
const BARS = [10, 18, 26, 14, 30, 22, 12, 28, 20, 32, 16, 24, 10, 26, 18, 30, 14, 22, 12, 20, 28, 16]

/** Hero: a live AI-interview window — face scan, typed question, voice
 *  waveform — with verification chips floating around it. Orange + white only. */
export default function HeroScene() {
  const [ref, mg] = useInView()

  return (
    <div ref={ref} className={`relative mx-auto w-full max-w-md ${mg}`} aria-hidden="true">
      <div className="mg-pop relative overflow-hidden rounded-3xl border border-brand-200 bg-white">
        {/* Window chrome */}
        <div className="flex items-center justify-between border-b border-brand-100 px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />
            <span className="h-2.5 w-2.5 rounded-full bg-brand-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-brand-200" />
          </div>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-ink-700">
            <span className="mg-rec h-2 w-2 rounded-full bg-brand-600" /> Live AI interview
          </div>
          <span className="font-mono text-[11px] text-ink-400">04:12</span>
        </div>

        {/* Camera stage */}
        <div className="relative h-56 overflow-hidden bg-brand-50">
          {/* Cartoon candidate — head centred on (100,62) so the scan bracket frames the face */}
          <svg viewBox="0 0 200 160" className="absolute bottom-0 left-1/2 h-56 -translate-x-1/2">
            {/* body: shirt + collar + neck */}
            <path d="M40 160c3-30 22-46 46-50h28c24 4 43 20 46 50z" fill="#ea580c" />
            <path d="M88 110l12 16 12-16z" fill="#fff" />
            <path d="M86 110l14 20-20 6-6-22z M114 110l-14 20 20 6 6-22z" fill="#c2410c" />
            <rect x="91" y="88" width="18" height="22" rx="6" fill="#e8b48d" />
            <g className="hs-nod">
              {/* ears */}
              <ellipse cx="70" cy="64" rx="5" ry="7" fill="#f2c29b" />
              <ellipse cx="130" cy="64" rx="5" ry="7" fill="#f2c29b" />
              {/* face */}
              <ellipse cx="100" cy="64" rx="29" ry="32" fill="#f7cfa8" />
              {/* hair */}
              <path d="M70 60c-3-22 12-36 31-36 20 0 34 13 30 36-4-10-12-15-21-16-9 6-26 9-40 16z" fill="#2d1f16" />
              {/* brows */}
              <path d="M84 55q6-4 12 0 M104 55q6-4 12 0" stroke="#2d1f16" strokeWidth="2.4" strokeLinecap="round" fill="none" />
              {/* eyes (blink) */}
              <g className="hs-blink">
                <ellipse cx="90" cy="64" rx="3.4" ry="4" fill="#2d1f16" />
                <ellipse cx="110" cy="64" rx="3.4" ry="4" fill="#2d1f16" />
                <circle cx="91.2" cy="62.6" r="1.1" fill="#fff" />
                <circle cx="111.2" cy="62.6" r="1.1" fill="#fff" />
              </g>
              {/* cheeks, nose, smile */}
              <ellipse cx="82" cy="75" rx="5" ry="3" fill="#fb923c" opacity="0.35" />
              <ellipse cx="118" cy="75" rx="5" ry="3" fill="#fb923c" opacity="0.35" />
              <path d="M100 66q-3 7 1 9" stroke="#d9946a" strokeWidth="1.8" strokeLinecap="round" fill="none" />
              <path className="hs-talk" d="M91 81q9 8 18 0" stroke="#9a3412" strokeWidth="2.6" strokeLinecap="round" fill="#fff" />
            </g>
          </svg>

          {/* Face-scan bracket around the head, with a sweeping scan line */}
          <div className="mg-bracket absolute h-[116px] w-[116px]" style={{ left: 'calc(50% - 58px)', top: 28 }}>
            <span className="absolute left-0 top-0 h-4 w-4 rounded-tl-md border-l-2 border-t-2 border-brand-700" />
            <span className="absolute right-0 top-0 h-4 w-4 rounded-tr-md border-r-2 border-t-2 border-brand-700" />
            <span className="absolute bottom-0 left-0 h-4 w-4 rounded-bl-md border-b-2 border-l-2 border-brand-700" />
            <span className="absolute bottom-0 right-0 h-4 w-4 rounded-br-md border-b-2 border-r-2 border-brand-700" />
            <span className="mg-scanline absolute inset-x-1 top-1/2 h-0.5 rounded-full bg-white" />
          </div>

          <div className="mg-pop absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-brand-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-brand-700" style={{ '--d': '1100ms' }}>
            <ScanFace className="h-3 w-3" /> Face verified
          </div>
        </div>

        {/* Question + answer waveform */}
        <div className="space-y-3 p-4">
          <div className="flex items-start gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
              <Bot className="h-3.5 w-3.5" />
            </span>
            <p className="mg-type rounded-2xl rounded-tl-sm bg-brand-50 px-3 py-2 text-xs text-ink-900" style={{ '--d': '700ms' }}>
              Tell me about a project you’re proud of.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Mic className="h-3.5 w-3.5" />
            </span>
            <div className="mg-bars flex h-8 flex-1 items-center gap-[3px]">
              {BARS.map((h, i) => (
                <span
                  key={i}
                  className="w-1 flex-1 rounded-full bg-brand-500"
                  style={{ height: h, '--d': `${(i * 83) % 700}ms` }}
                />
              ))}
            </div>
            <span className="text-[10px] font-medium text-ink-400">Speaking…</span>
          </div>
        </div>
      </div>

      {/* Floating result chips */}
      <div className="mg-float absolute -left-2 top-28 rounded-2xl border border-brand-200 bg-white p-3 sm:-left-12" style={{ '--d': '900ms' }}>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Confidence</div>
        <div className="mt-0.5 text-lg font-semibold text-ink-900">
          <span className="mg-count" style={{ '--mg-n': 87, '--d': '900ms' }} />
        </div>
        <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-brand-100">
          <div className="mg-grow h-full rounded-full bg-brand-600" style={{ width: '87%', '--d': '1000ms' }} />
        </div>
      </div>

      <div className="mg-float absolute -right-2 -top-4 flex items-center gap-2.5 rounded-2xl border border-brand-200 bg-white p-2.5 sm:-right-10" style={{ '--d': '1300ms' }}>
        <svg viewBox="0 0 36 36" className="h-10 w-10 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="#ffedd5" strokeWidth="4" />
          <circle
            className="mg-ring"
            cx="18" cy="18" r="15" fill="none" stroke="#ea580c" strokeWidth="4" strokeLinecap="round"
            pathLength="100" strokeDasharray="100" strokeDashoffset="8"
            style={{ '--d': '1300ms' }}
          />
        </svg>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">ATS match</div>
          <div className="text-sm font-semibold text-ink-900">
            <span className="mg-count" style={{ '--mg-n': 92, '--d': '1300ms' }} />
          </div>
        </div>
      </div>

      <div className="mg-float absolute -right-2 bottom-24 flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-2 text-xs font-semibold text-ink-900 sm:-right-8" style={{ '--d': '1700ms' }}>
        <AudioLines className="h-4 w-4 text-brand-600" /> Voice match
        <CheckCircle2 className="h-4 w-4 text-brand-600" />
      </div>
    </div>
  )
}
