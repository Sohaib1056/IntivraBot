import { useRef, useState } from 'react'
import FeatureOrbit from './FeatureOrbit'
import { Split } from './Fx'
import { gsap, useGSAP, DESKTOP, MOBILE } from './gsap'

/**
 * Features as a pinned scroll story (desktop): the section locks in place and
 * each scroll step brings in the next feature — the wheel turns to it, its
 * card slides up, the progress rail fills. Phones get a normal list and the
 * wheel cycles on its own.
 */
export default function FeatureStory({ features }) {
  const root = useRef(null)
  const [active, setActive] = useState(0)
  const n = features.length

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(DESKTOP, () => {
        gsap.to('.fs-fill', {
          scaleY: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: '.fs-pin',
            start: 'top top',
            end: () => `+=${window.innerHeight * 0.6 * n}`,
            pin: true,
            scrub: 0.4,
            invalidateOnRefresh: true,
            onUpdate: (st) => setActive(Math.min(n - 1, Math.floor(st.progress * n))),
          },
        })
      })
      mm.add(MOBILE, () => {
        const id = setInterval(() => setActive((a) => (a + 1) % n), 2200)
        return () => clearInterval(id)
      })
      return () => mm.revert()
    },
    { scope: root }
  )

  return (
    <section id="features" ref={root} className="relative isolate">
      <div className="fs-pin mx-auto flex max-w-[1600px] items-center px-5 py-8 sm:px-6 lg:h-screen lg:py-10">
        <div className="grid w-full items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <span data-reveal className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">
              The complete pipeline
            </span>
            <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-4xl">
              <Split parts={['One platform,', ['the whole pipeline', 'text-brand-600']]} />
            </h2>
            <p data-reveal="0.1" className="mt-4 max-w-lg text-lg text-ink-700 font-medium">
              Other tools cover a single stage — IntivraBot covers the entire journey, all wired into one AI core.
            </p>

            {/* Desktop: one card at a time + progress rail.  Mobile: plain list. */}
            <div className="mt-8 flex gap-5">
              <div className="relative hidden w-1 shrink-0 overflow-hidden rounded-full bg-ink-200 lg:block">
                <div className="fs-fill absolute inset-0 origin-top scale-y-0 rounded-full bg-brand-600" />
              </div>
              <div data-stagger className="grid flex-1 gap-3 sm:grid-cols-2 lg:relative lg:block lg:h-[300px]">
                {features.map((f, i) => {
                  const state = i === active ? 'fs-on' : i < active ? 'fs-past' : 'fs-next'
                  // outer div is what the scroll cascade animates; the inner
                  // card owns the active/past/next state so the two never fight
                  return (
                    <div key={f.title} className="lg:absolute lg:inset-0">
                    <div className={`fs-card ${state} card-base h-full p-5 lg:p-7`}>
                      <div className="flex items-center gap-4">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white lg:h-14 lg:w-14">
                          <f.icon className="h-6 w-6" />
                        </span>
                        <div>
                          <div className="text-xs font-bold tracking-widest text-brand-600">
                            {String(i + 1).padStart(2, '0')} <span className="text-ink-300">/ {String(n).padStart(2, '0')}</span>
                          </div>
                          <h3 className="text-lg font-bold text-ink-900 lg:text-2xl">{f.title}</h3>
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-ink-700 lg:mt-4 lg:text-base">{f.desc}</p>
                      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-brand-100 pt-4">
                        <ul className="space-y-1.5">
                          {f.points.map((pt) => (
                            <li key={pt} className="flex items-center gap-2 text-sm font-medium text-ink-700">
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[9px] text-white">✓</span>
                              {pt}
                            </li>
                          ))}
                        </ul>
                        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-2 text-right">
                          <div className="text-2xl font-semibold text-brand-600">{f.stat[0]}</div>
                          <div className="text-[11px] font-medium uppercase tracking-wide text-ink-700">{f.stat[1]}</div>
                        </div>
                      </div>
                    </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div data-reveal className="order-first lg:order-none">
            <FeatureOrbit features={features} active={active} />
          </div>
        </div>
      </div>
    </section>
  )
}
