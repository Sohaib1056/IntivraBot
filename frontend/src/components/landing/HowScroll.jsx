import { useEffect, useRef, useState } from 'react'
import { Split } from './Fx'
import { useInView } from './useInView'
import { gsap, useGSAP, DESKTOP } from './gsap'
import { ApplyVisual, VerifyVisual, InterviewVisual, ReportVisual } from './StepVisuals'

const VISUALS = [ApplyVisual, VerifyVisual, InterviewVisual, ReportVisual]
const STEP_MS = 4200

/**
 * How it works — scroll-driven on desktop: the section pins to the screen and
 * scrolling walks through the four steps. The active step's bar fills with the
 * scroll, a rail on the left tracks overall progress, and the stage on the
 * right swaps to that step's animated visual. Phones auto-play instead.
 */
export default function HowScroll({ steps }) {
  const [ref, mg] = useInView()
  const pin = useRef(null)
  const [active, setActive] = useState(0)
  const [local, setLocal] = useState(0) // 0..1 progress inside the active step
  const [scrollMode, setScrollMode] = useState(false)
  const n = steps.length
  const playing = mg === 'mg-in'

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(DESKTOP, () => {
        setScrollMode(true)
        gsap.to('.hw-rail', {
          scaleY: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: pin.current,
            start: 'top top',
            end: () => `+=${window.innerHeight * 0.7 * n}`,
            pin: true,
            scrub: 0.3,
            invalidateOnRefresh: true,
            onUpdate: (st) => {
              const x = st.progress * n
              const i = Math.min(n - 1, Math.floor(x))
              setActive(i)
              setLocal(st.progress >= 1 ? 1 : x - i)
            },
          },
        })
        // stage leans in as the scene starts
        gsap.from('.hw-stage', {
          rotateY: -12, x: 60, opacity: 0, transformPerspective: 1200, ease: 'power2.out',
          scrollTrigger: { trigger: pin.current, start: 'top 85%', end: 'top 20%', scrub: 1 },
        })
        return () => setScrollMode(false)
      })
      return () => mm.revert()
    },
    { scope: pin }
  )

  // Phones / no pin: auto-advance while on screen
  useEffect(() => {
    if (scrollMode || !playing) return
    const id = setTimeout(() => setActive((a) => (a + 1) % n), STEP_MS)
    return () => clearTimeout(id)
  }, [active, playing, scrollMode, n])

  const Visual = VISUALS[active]
  const ActiveIcon = steps[active].icon

  return (
    <section id="how" ref={ref} className={`border-y border-brand-100 bg-ink-50/60 ${mg}`}>
      <div ref={pin} className="mx-auto flex max-w-[1600px] flex-col justify-center px-4 py-8 sm:px-5 lg:h-screen lg:pt-20 lg:pb-6">
        <div className="mb-6 text-center">
          <span data-reveal className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">4 steps · fully automated</span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            <Split parts={['How it', ['works', 'text-brand-600']]} />
          </h2>
        </div>

        <div className="grid items-center gap-6 lg:grid-cols-5">
          {/* stepper */}
          <div className="flex gap-4 lg:col-span-2">
          <div className="relative hidden w-1 shrink-0 overflow-hidden rounded-full bg-brand-100 lg:block">
            <div className="hw-rail absolute inset-0 origin-top scale-y-0 rounded-full bg-brand-600" />
          </div>
          <ol data-stagger className="flex-1 space-y-2.5">
            {steps.map((s, i) => {
              const on = i === active
              return (
                <li key={s.n}>
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    className={`relative w-full overflow-hidden rounded-xl border bg-white p-4 text-left transition duration-300 ${
                      on ? 'translate-x-2 border-brand-600' : i < active ? 'border-brand-300' : 'border-brand-200 hover:border-brand-400'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition ${on ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-600'}`}>
                        <s.icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold uppercase tracking-widest text-brand-600">Step {s.n}</div>
                        <div className="text-base font-semibold text-ink-900">{s.t}</div>
                        <p className={`overflow-hidden text-sm text-ink-700 transition-all duration-500 ${on ? 'mt-1 max-h-12 opacity-100' : 'max-h-0 opacity-0'}`}>{s.d}</p>
                      </div>
                      <span className={`text-2xl font-semibold transition ${on ? 'text-brand-600' : 'text-ink-300'}`}>{s.n}</span>
                    </div>
                    {/* story-style timer */}
                    <span className="absolute inset-x-0 bottom-0 h-1 bg-brand-50">
                      {scrollMode ? (
                        <span className="block h-full origin-left bg-brand-600" style={{ transform: `scaleX(${i < active ? 1 : on ? local : 0})` }} />
                      ) : (
                        on && playing && <span key={active} className="hw-fill block h-full bg-brand-600" style={{ animationDuration: `${STEP_MS}ms` }} />
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
          </div>

          {/* stage — remounted per step so its animation replays */}
          <div data-reveal-m className="hw-stage lg:col-span-3">
            <div className="card-base relative overflow-hidden rounded-2xl p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                  <ActiveIcon className="h-4 w-4 text-brand-600" />
                  {steps[active].t}
                </div>
                <div className="flex gap-1.5">
                  {steps.map((s, i) => (
                    <span key={s.n} className={`h-1.5 rounded-full transition-all duration-500 ${i === active ? 'w-6 bg-brand-600' : 'w-1.5 bg-brand-200'}`} />
                  ))}
                </div>
              </div>
              <div key={active} className="hw-swap">
                <Visual />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
