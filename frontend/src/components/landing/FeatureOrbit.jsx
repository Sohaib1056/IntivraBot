import { useInView } from './useInView'

const R = 40 // orbit radius, % of the box

/**
 * Features: every capability sits on a wheel around one AI core. The wheel
 * turns so the ACTIVE feature faces the text (left), its spoke becomes a
 * glowing beam, and the core swaps to that feature's icon.
 */
export default function FeatureOrbit({ features, active = 0 }) {
  const [ref, mg] = useInView()
  const step = 360 / features.length
  // node i sits at -90 + step*i; turn the wheel so the active one is at 180°
  const turn = 270 - step * active
  const nodes = features.map((f, i) => {
    const a = ((-90 + step * i) * Math.PI) / 180
    return { ...f, x: 50 + R * Math.cos(a), y: 50 + R * Math.sin(a) }
  })
  const Active = features[active].icon

  return (
    <div ref={ref} className={`relative mx-auto aspect-square w-full max-w-[380px] ${mg}`} aria-hidden="true">
      {/* slowly spinning outer rings */}
      <div className="mg-spin-slow absolute inset-[2%] rounded-full border border-dashed border-brand-300" />
      <div className="mg-spin-rev absolute inset-[24%] rounded-full border border-dotted border-brand-400" />

      {/* The wheel — rotated by the active feature */}
      <div className="absolute inset-0 transition-transform duration-[1100ms] ease-[cubic-bezier(0.65,0,0.35,1)]" style={{ transform: `rotate(${turn}deg)` }}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible">
          <circle cx="50" cy="50" r={R} fill="none" stroke="#fdba74" strokeWidth="0.35" strokeDasharray="1.2 1.6" />
          {nodes.map((n, i) => {
            const on = i === active
            return (
              <g key={n.title}>
                <line
                  x1={n.x} y1={n.y} x2="50" y2="50"
                  stroke={on ? '#ea580c' : '#fed7aa'} strokeWidth={on ? 1.4 : 0.35}
                  style={{ transition: 'stroke-width .6s' }}
                />
                <line
                  className="mg-flow"
                  x1={n.x} y1={n.y} x2="50" y2="50" pathLength="100"
                  stroke={on ? '#fff' : '#ea580c'} strokeWidth={on ? 1.1 : 0.9} strokeLinecap="round"
                  style={{ '--d': `${i * 400}ms` }}
                />
              </g>
            )
          })}
        </svg>

        {nodes.map((n, i) => {
          const on = i === active
          return (
            <div key={n.title} className="absolute -ml-8 -mt-8 h-16 w-16" style={{ left: `${n.x}%`, top: `${n.y}%` }}>
              {/* counter-rotate so the icon stays upright while the wheel turns */}
              <div className="h-full w-full transition-transform duration-[1100ms] ease-[cubic-bezier(0.65,0,0.35,1)]" style={{ transform: `rotate(${-turn}deg)` }}>
                <div className="mg-pop h-full w-full" style={{ '--d': `${200 + i * 120}ms` }}>
                  <div
                    className={`flex h-full w-full flex-col items-center justify-center rounded-2xl border transition-all duration-500 ${
                      on
                        ? 'scale-125 border-brand-600 bg-brand-600 text-white'
                        : 'border-brand-200 bg-white text-brand-600'
                    }`}
                  >
                    <n.icon className="h-6 w-6" />
                    <span className={`mt-0.5 text-[8px] font-bold uppercase tracking-wide ${on ? 'text-brand-100' : 'text-ink-700'}`}>{n.short}</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Static core — shows the active feature */}
      <div className="absolute left-1/2 top-1/2 -ml-14 -mt-14 h-28 w-28">
        <span className="mg-ping absolute inset-0 rounded-full bg-brand-400" />
        <span className="mg-ping absolute inset-0 rounded-full bg-brand-300" style={{ '--d': '1000ms' }} />
        <div className="mg-pop relative flex h-full w-full flex-col items-center justify-center rounded-full bg-brand-600 text-white ring-8 ring-white">
          <Active key={active} className="fo-swap h-9 w-9" />
          <span key={`l${active}`} className="fo-swap mt-1 text-[9px] font-bold uppercase tracking-wider text-brand-100">{features[active].short}</span>
        </div>
      </div>
    </div>
  )
}
