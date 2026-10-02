import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, UserRound, Briefcase } from 'lucide-react'
import Button from '../ui/Button'
import { CvScan, RankBoard } from './RoleGraphics'
import { useInView } from './useInView'
import { Split, useTilt } from './Fx'
import { gsap, useGSAP, MOTION_OK } from './gsap'

const ROLES = [
  {
    side: 'l', icon: UserRound, tag: 'For Candidates', title: 'Show what you can really do',
    Visual: CvScan, cta: 'Apply as Candidate', variant: 'primary',
    points: ['Upload your CV and let AI extract your skills', 'Take an AI interview once you match', 'Get an instant score and feedback report'],
  },
  {
    side: 'r', icon: Briefcase, tag: 'For HR Managers', title: 'A ranked shortlist, not a pile',
    Visual: RankBoard, cta: 'Hire with IntivraBot', variant: 'secondary',
    points: ['Post a job and set your thresholds', 'Review ranked reports with fraud flags', 'Finalize your shortlist in one click'],
  },
]

function RoleCard({ role }) {
  const [ref, mg] = useInView()
  const tilt = useTilt(8)
  return (
    <div className={`role-${role.side}`}>
      <div ref={ref} {...tilt} className={`card-base h-full overflow-hidden p-5 ${mg}`}>
        <role.Visual />
        <div className="mt-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-brand-600">
          <role.icon className="h-4 w-4" /> {role.tag}
        </div>
        <h3 className="mt-2 text-2xl font-semibold text-ink-900">{role.title}</h3>
        <ul className="mt-3 space-y-1.5">
          {role.points.map((t, i) => (
            <li key={t} className="mg-chip flex items-start gap-2 text-sm text-ink-600" style={{ '--d': `${300 + i * 150}ms` }}>
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /> {t}
            </li>
          ))}
        </ul>
        <Button as={Link} to="/register" variant={role.variant} className="relative z-10 mt-4">{role.cta}</Button>
      </div>
    </div>
  )
}

/** Roles: the two cards swing in from opposite sides, scrubbed to scroll. */
export default function RolesSection() {
  const root = useRef(null)
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        const st = { trigger: '.roles-grid', start: 'top 95%', end: 'top 40%', scrub: 1 }
        gsap.from('.role-l', { xPercent: -45, rotateY: 35, rotateZ: -4, opacity: 0, transformPerspective: 1400, ease: 'power2.out', scrollTrigger: st })
        gsap.from('.role-r', { xPercent: 45, rotateY: -35, rotateZ: 4, opacity: 0, transformPerspective: 1400, ease: 'power2.out', scrollTrigger: st })
      })
      return () => mm.revert()
    },
    { scope: root }
  )

  return (
    <section id="roles" ref={root} className="relative isolate overflow-hidden">
      <div className="mx-auto max-w-[1600px] px-5 py-8 sm:px-6 lg:py-10">
        <div className="mb-6 text-center">
          <span data-reveal className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">Built for both sides</span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            <Split parts={['One tool,', ['two winners', 'text-brand-600']]} />
          </h2>
        </div>
        <div className="roles-grid grid gap-6 md:grid-cols-2">
          {ROLES.map((r) => <RoleCard key={r.tag} role={r} />)}
        </div>
      </div>
    </section>
  )
}
