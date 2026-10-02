import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import Button from '../ui/Button'
import { useRef } from 'react'
import { useInView } from './useInView'
import { gsap, useGSAP, MOTION_OK } from './gsap'

const TICKER = ['Resume screening', 'AI interviews', 'Face verification', 'Voice biometrics', 'Emotion analysis', 'English & Urdu', 'Instant reports']

// Fixed (not random) so server/client and every render agree.
const PARTICLES = [
  { l: 6, s: 6, t: 7, d: 0 }, { l: 18, s: 4, t: 5.5, d: 1.2 }, { l: 31, s: 8, t: 8, d: 2.4 },
  { l: 47, s: 5, t: 6.5, d: 0.6 }, { l: 58, s: 7, t: 7.5, d: 3.1 }, { l: 72, s: 4, t: 6, d: 1.8 },
  { l: 84, s: 6, t: 8.5, d: 0.3 }, { l: 93, s: 5, t: 6.8, d: 2.7 },
]

const HEADLINE = ['Ready', 'to', 'hire', 'smarter?']

/** CTA: a tilted kinetic ticker, a headline that rises word by word, rising
 *  particles and rotating rings, and a sheen sweeping the button. */
export default function CtaBand() {
  const [ref, mg] = useInView()
  const scope = useRef(null)

  // the headline zooms up from small and faint as the band scrolls into view
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        gsap.fromTo('.cta-zoom', { scale: 0.7, opacity: 0.2, letterSpacing: '0.2em' }, {
          scale: 1, opacity: 1, letterSpacing: '-0.02em', ease: 'none',
          scrollTrigger: { trigger: scope.current, start: 'top bottom', end: 'center 60%', scrub: 1 },
        })
      })
      return () => mm.revert()
    },
    { scope }
  )

  return (
    <section ref={(el) => { ref.current = el; scope.current = el }} className={`relative overflow-hidden bg-brand-600 ${mg}`}>
      {/* rotating rings */}
      <div className="mg-spin-slow pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full border-2 border-dashed border-white" />
      <div className="mg-spin-rev pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full border-2 border-dashed border-white" />

      {/* particles */}
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="mg-particle pointer-events-none absolute bottom-0 rounded-full bg-white"
          style={{ left: `${p.l}%`, width: p.s, height: p.s, '--t': `${p.t}s`, '--d': `${p.d}s` }}
        />
      ))}

      {/* tilted ticker */}
      <div className="relative -mx-4 mt-4 -rotate-1 bg-white py-2.5">
        <div className="mg-marquee flex w-max">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
              {TICKER.map((t) => (
                <span key={t} className="flex items-center whitespace-nowrap px-5 text-xs font-bold uppercase tracking-[0.18em] text-brand-600 sm:text-sm">
                  {t}
                  <span className="ml-10 text-brand-600">✦</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="relative mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-8 px-4 py-8 text-center lg:flex-row lg:px-6 lg:text-left">
        <div className="text-white">
          <h3 className="cta-zoom origin-center text-4xl font-semibold tracking-tight sm:text-6xl lg:origin-left">
            {HEADLINE.map((w, i) => (
              <span key={w} className="mg-word mr-[0.28em] inline-block overflow-hidden pb-1 align-bottom">
                <span className="inline-block" style={{ '--d': `${150 + i * 110}ms` }}>{w}</span>
              </span>
            ))}
          </h3>
          <p className="mg-rise mt-3 text-lg text-brand-100" style={{ '--d': '650ms' }}>Create your free account today.</p>
        </div>
        <div className="mg-pop relative shrink-0 overflow-hidden rounded-lg" style={{ '--d': '800ms' }}>
          <Button as={Link} to="/register" variant="secondary" size="lg">
            Get started free <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  )
}
