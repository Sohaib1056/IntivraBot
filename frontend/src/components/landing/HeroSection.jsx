import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ShieldCheck, Timer, Layers, Scale } from 'lucide-react'
import Button from '../ui/Button'
import HeroScene from './HeroScene'
import { Split, useTilt } from './Fx'
import { gsap, useGSAP, MOTION_OK } from './gsap'

// Fixed positions so every render agrees.
const STARS = [
  [8, 22, 3, 0], [15, 70, 2, 1.2], [26, 40, 2, 2.1], [38, 82, 3, 0.6], [47, 14, 2, 1.8],
  [55, 60, 2, 2.6], [63, 30, 3, 0.3], [72, 78, 2, 1.5], [81, 18, 2, 2.9], [90, 52, 3, 0.9], [95, 85, 2, 2.2],
]

const STATS = [
  { icon: Timer, count: 80, suffix: '%', label: 'Less screening time' },
  { icon: Layers, big: '3-in-1', label: 'Resume + Interview + Emotion' },
  { icon: Scale, big: '0 bias', label: 'Objective scoring' },
]

/** Hero: aurora backdrop, word-by-word headline, a 3D-tiltable interview
 *  scene that sinks back into the page as you scroll away. */
export default function HeroSection() {
  const root = useRef(null)
  const tilt = useTilt(14)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        gsap.from('.hero-in', { y: 40, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.12, delay: 0.35 })
        gsap.from('.hero-scene-in', { y: 120, rotateX: 30, scale: 0.85, opacity: 0, transformPerspective: 1200, duration: 1.6, ease: 'expo.out', delay: 0.2 })

      })
      return () => mm.revert()
    },
    { scope: root }
  )

  return (
    <section ref={root} className="relative isolate overflow-hidden">
      {/* twinkling orange dots — the only backdrop, page stays white */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        {STARS.map(([l, t, s, d], i) => (
          <span key={i} className="fx-twinkle absolute rounded-full bg-brand-500" style={{ left: `${l}%`, top: `${t}%`, width: s * 2, height: s * 2, '--d': `${d}s`, '--t': `${3 + (i % 3)}s` }} />
        ))}
      </div>

      <div className="mx-auto max-w-[1600px] px-5 pb-6 pt-6 sm:px-6 lg:pb-8 lg:pt-8">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-10">
          <div className="hero-copy mx-auto max-w-3xl text-center lg:mx-0 lg:text-left">
            <span className="hero-in inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
              </span>
              <ShieldCheck className="h-3.5 w-3.5" /> AI-powered · Unbiased · Secure
            </span>
            <h1 className="mt-5 text-5xl font-semibold leading-[1.02] tracking-tight text-ink-900 sm:text-5xl">
              <Split
                parts={[
                  'Hire smarter with',
                  ['AI-driven interviews', 'text-brand-600'],
                ]}
              />
            </h1>
            <p className="hero-in mx-auto mt-5 max-w-xl text-lg text-ink-700 font-medium lg:mx-0">
              IntivraBot automates the first round of recruitment — resume screening, AI interviews,
              face &amp; voice verification, and detailed reports. Save HR time and remove bias.
            </p>
            <div className="hero-in mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <Button as={Link} to="/register" size="lg" className="group w-full sm:w-auto">
                Start free <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Button>
              <Button as={Link} to="/login" size="lg" variant="secondary" className="w-full sm:w-auto">
                I already have an account
              </Button>
            </div>
            <p className="hero-in mt-3 text-xs text-ink-400">No credit card required · Free during beta</p>
          </div>

          {/* three layers so the scroll, intro and mouse-tilt tweens never share a transform */}
          <div className="hero-scene px-4 sm:px-10 lg:px-6">
            <div className="hero-scene-in">
              <div {...tilt} className="will-change-transform" style={{ transformStyle: 'preserve-3d' }}>
                <HeroScene />
              </div>
            </div>
          </div>
        </div>

        {/* Stats — glass cards, numbers count up */}
        <div className="mx-auto mt-8 grid max-w-6xl gap-4 sm:grid-cols-3">
          {STATS.map(({ icon: Icon, count, suffix, big, label }) => (
            <div key={label} className="relative overflow-hidden rounded-2xl bg-brand-600 p-6 text-white transition hover:bg-brand-700">
              <Icon className="h-6 w-6 text-white" />
              <div className="mt-3 text-4xl font-semibold tracking-tight">
                {count != null ? <span data-count={count} data-suffix={suffix}>{count}{suffix}</span> : big}
              </div>
              <div className="mt-1 text-sm text-brand-100">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
