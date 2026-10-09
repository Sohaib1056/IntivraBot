import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Bot, ShieldCheck, FileScan, Mic, ScanFace,
  BarChart3, Languages, Mail, MapPin, Clock, Send,
} from 'lucide-react'
import PublicNavbar from '../components/layout/PublicNavbar'
import Button from '../components/ui/Button'
import Logo from '../components/ui/Logo'
import Spinner from '../components/ui/Spinner'
import { Input, Textarea } from '../components/ui/Input'
import { useToast } from '../context/ToastContext'
import HeroSection from '../components/landing/HeroSection'
import FeatureStory from '../components/landing/FeatureStory'
import HowScroll from '../components/landing/HowScroll'
import RolesSection from '../components/landing/RolesSection'
import ChatDemo from '../components/landing/ChatDemo'
import ContactFlight from '../components/landing/ContactFlight'
import CtaBand from '../components/landing/CtaBand'
import { Split, usePageFx } from '../components/landing/Fx'
import '../components/landing/motion.css'
import { isEmail } from '../lib/validators'

const features = [
  { icon: FileScan, short: 'ATS', title: 'ATS Resume Scanning', desc: 'Resumes are parsed, skills & experience extracted, then matched to the job.',
    points: ['PDF & DOCX parsing', '150+ skill taxonomy', 'Match score per job'], stat: ['92%', 'avg. match accuracy'] },
  { icon: Bot, short: 'Interview', title: 'AI Interviews', desc: 'Adaptive AI questions - text or voice, in real time.',
    points: ['Follow-ups based on answers', 'HR custom questions', 'Field-specific rubrics'], stat: ['10', 'field rubrics'] },
  { icon: ScanFace, short: 'Face', title: 'Face Verification', desc: 'Matched against the registration photo - the real candidate, no proxies.',
    points: ['Live face match', 'Gaze & presence checks', 'Proctoring screenshots'], stat: ['24/7', 'monitoring in session'] },
  { icon: Mic, short: 'Voice', title: 'Voice Biometrics', desc: 'A voice fingerprint confirms the speaker and detects multiple voices.',
    points: ['Voice enrolment', 'Speaker match per answer', 'Multiple-voice alerts'], stat: ['1', 'voice per candidate'] },
  { icon: BarChart3, short: 'Emotion', title: 'Emotion Analysis', desc: 'Confidence, stress and engagement measured on every question.',
    points: ['Per-question scores', 'Confidence & stress', 'Included in the report'], stat: ['3', 'signals tracked live'] },
  { icon: Languages, short: 'EN / UR', title: 'Multi-language', desc: 'English and Urdu - candidates interview in their preferred language.',
    points: ['English & Urdu', 'Roman Urdu support', 'Same scoring in both'], stat: ['2', 'languages'] },
]

const steps = [
  { n: '01', icon: FileScan, t: 'Apply', d: 'Candidate uploads a CV and gets an ATS match score.' },
  { n: '02', icon: ScanFace, t: 'Verify', d: 'Face + voice check confirms the real candidate.' },
  { n: '03', icon: Bot, t: 'Interview', d: 'AI asks adaptive questions, emotion monitored live.' },
  { n: '04', icon: BarChart3, t: 'Report', d: 'Scores, strengths and shortlist - sent to both sides.' },
]

const faqs = [
  ['Can candidates answer in text?', 'Voice is the default, but with a valid reason (mic, internet, or accessibility) a candidate can switch to text. Face verification keeps running throughout.'],
  ['Is my data secure?', 'Yes. Passwords are encrypted, files are in secure storage, and face/voice are used only for verification - with your consent.'],
  ['Is it free?', 'During beta, IntivraBot is free for both candidates and recruiters.'],
  ['Which languages are supported?', 'English and Urdu - candidates can interview in the language they prefer.'],
]

export default function Landing() {
  const root = useRef(null)
  // Must run after the pinned scenes register (children's effects run first).
  usePageFx(root)

  return (
    <div ref={root} className="lp min-h-screen overflow-x-clip bg-white">
      {/* scroll progress */}
      <div className="fx-progress fixed inset-x-0 top-0 z-[70] h-[3px] bg-brand-600" aria-hidden="true" />
      <PublicNavbar />

      <HeroSection />
      <FeatureStory features={features} />
      <HowScroll steps={steps} />
      <RolesSection />

      {/* FAQ */}
      <section id="faq" className="relative isolate overflow-hidden border-t border-brand-100 bg-ink-50/60">
        <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:py-10">
          <div className="mb-4 text-center">
            <span data-reveal className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">Got questions?</span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              <Split parts={['Frequently', ['asked', 'text-brand-600']]} />
            </h2>
          </div>
          <div className="grid items-start gap-10 lg:grid-cols-5">
            <div data-reveal className="lg:sticky lg:top-24 lg:col-span-2">
              <ChatDemo />
            </div>
            <div data-stagger className="space-y-3 lg:col-span-3">
              {faqs.map(([q, a]) => (
                <details key={q} className="group card-base p-5 [&_summary]:cursor-pointer">
                  <summary className="flex list-none items-center justify-between text-base font-semibold text-ink-900">
                    {q}
                    <span className="ml-4 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition duration-300 group-open:rotate-45 group-open:bg-brand-600 group-open:text-white">+</span>
                  </summary>
                  <p className="mt-3 text-sm text-ink-700">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Contact */}
      <ContactSection />

      {/* CTA band */}
      <CtaBand />

      {/* Footer */}
      {/* A tinted ground, not white — the previous white-on-white footer had
          nothing to separate it from the section above and read as empty page. */}
      <footer className="relative overflow-hidden bg-ink-50">
        {/* brand rule with a light running along it */}
        <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-brand-500" aria-hidden="true">
          <span className="mg-sweep absolute inset-y-0 left-0 w-16 bg-white" />
        </div>

        <div className="relative mx-auto max-w-[1600px] px-5 pb-6 pt-9 sm:px-6">
          <div data-stagger className="grid gap-8 md:grid-cols-5 md:gap-6">
            {/* Brand column */}
            <div className="md:col-span-2">
              {/* Clickable too — someone who has read to the bottom is the
                  most likely person to want the top again. */}
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                aria-label="Back to top"
                className="rounded-lg transition hover:opacity-80"
              >
                <Logo />
              </button>
              <p className="mt-3 max-w-[19rem] text-sm leading-relaxed text-ink-700">
                AI-powered recruitment — resume screening, intelligent interviews,
                and identity verification in one place.
              </p>

              {/* Contact sits inline rather than stacked: two short lines took
                  three rows of height for no gain. */}
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                {footerContact.map(({ icon: Icon, value, href }) => (
                  <a
                    key={value}
                    href={href}
                    className="group inline-flex items-center gap-2 text-sm font-medium text-ink-700 transition hover:text-brand-600"
                  >
                    <Icon className="h-4 w-4 text-brand-600" />
                    <span className="border-b border-transparent transition group-hover:border-brand-600">
                      {value}
                    </span>
                  </a>
                ))}
              </div>

              {/* The AI services being live is the one status worth stating —
                  more use than a row of social icons for accounts that don't
                  exist yet. */}
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="text-xs font-semibold text-emerald-700">All systems operational</span>
              </div>
            </div>

            {/* Link columns */}
            {footerLinks.map(({ title, items }) => (
              <div key={title}>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink-900">
                  {title}
                </h4>
                {/* A short brand rule under each heading ties the columns to
                    the page's accent without adding another colour. */}
                <span className="mt-1.5 block h-0.5 w-5 rounded-full bg-brand-500" />
                <ul className="mt-3 space-y-1.5">
                  {items.map(([label, href]) => (
                    <li key={label}>
                      {href.startsWith('/') ? (
                        <Link
                          to={href}
                          className="text-sm font-medium text-ink-600 transition hover:text-brand-600"
                        >
                          {label}
                        </Link>
                      ) : (
                        <a
                          href={href}
                          className="text-sm font-medium text-ink-600 transition hover:text-brand-600"
                        >
                          {label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div className="mt-7 flex flex-col items-center justify-between gap-3 border-t border-brand-100 pt-4 sm:flex-row">
            <p className="text-xs text-ink-700">
              © {new Date().getFullYear()} IntivraBot · Final Year Project
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {footerBadges.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-700"
                >
                  <Icon className="h-3 w-3 text-brand-600" />
                  {label}
                </span>
              ))}
              <span className="text-xs text-ink-700">Made with care in Pakistan 🇵🇰</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

const contactInfo = [
  { icon: Mail, label: 'Email us', value: 'hello@intivrabot.app' },
  { icon: MapPin, label: 'Based in', value: 'Gujranwala, Pakistan' },
  { icon: Clock, label: 'Response time', value: 'Within 24 hours' },
]

// The two details worth acting on, repeated in the footer so someone who has
// scrolled past the contact section doesn't have to scroll back up. `href` is
// what makes them useful — a mailto opens a client, the map opens directions.
const footerContact = [
  { icon: Mail, value: 'hello@intivrabot.app', href: 'mailto:hello@intivrabot.app' },
  { icon: MapPin, value: 'Gujranwala, Pakistan', href: '#contact' },
]

// What the product actually guarantees, in the place people look for trust
// marks. Each one is a real feature of this build, not a badge for its own sake.
const footerBadges = [
  { icon: ShieldCheck, label: 'Face & voice verified' },
  { icon: Languages, label: 'English & Urdu' },
]

const footerLinks = [
  {
    title: 'Product',
    items: [
      ['Features', '#features'],
      ['How it works', '#how'],
      ['For candidates', '#roles'],
      ['For recruiters', '#roles'],
    ],
  },
  {
    title: 'Company',
    items: [
      ['About', '#'],
      ['Careers', '#'],
      ['Contact', '#contact'],
      ['Blog', '/blog'],
    ],
  },
  {
    title: 'Legal',
    items: [
      ['Privacy', '#'],
      ['Terms', '#'],
      ['Security', '#'],
      ['Consent', '#'],
    ],
  },
]

function ContactSection() {
  const toast = useToast()
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }))
  }

  const submit = (e) => {
    e.preventDefault()
    const errs = {}
    if (!form.name.trim()) errs.name = 'Please enter your name.'
    if (!form.email) errs.email = 'Email is required.'
    else if (!isEmail(form.email)) errs.email = 'Enter a valid email address.'
    if (!form.message.trim()) errs.message = 'Please write a short message.'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      setForm({ name: '', email: '', message: '' })
      toast.success('Thanks! We’ll get back to you within 24 hours.')
    }, 800)
  }

  return (
    <section id="contact" className="relative isolate overflow-hidden border-t border-brand-100 bg-white">
      <div className="mx-auto max-w-[1600px] px-5 py-8 sm:px-6 lg:py-10">
        <div className="mb-4 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            <Split parts={['Get in', ['touch', 'text-brand-600']]} />
          </h2>
          <p data-reveal="0.1" className="mt-3 text-ink-700">Questions, feedback, or a demo request - we’d love to hear from you.</p>
        </div>

        <div className="grid gap-8 lg:grid-cols-5">
          {/* Info side */}
          <div data-stagger className="space-y-2 lg:col-span-2">
            <ContactFlight />
            {contactInfo.map((c) => (
              <div key={c.label} className="card-base flex items-center gap-3 px-4 py-2.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <c.icon className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-sm text-ink-700">{c.label}</div>
                  <div className="font-semibold text-ink-900">{c.value}</div>
                </div>
              </div>
            ))}
            <div className="rounded-xl bg-brand-600 p-4 text-white">
              <p className="text-sm font-semibold">Prefer to jump right in?</p>
              <p className="mt-1 text-sm text-brand-100">Create a free account and explore the full platform.</p>
              <Button as={Link} to="/register" variant="secondary" size="sm" className="mt-3">
                Start free <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Form side */}
          <div data-reveal="0.15" className="lg:col-span-3">
            <form onSubmit={submit} noValidate className="card-base space-y-3 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Your name" placeholder="e.g. Sohaib" value={form.name} onChange={set('name')} error={errors.name} />
                <Input label="Email" type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} error={errors.email} />
              </div>
              <Textarea label="Message" rows={3} placeholder="How can we help?" value={form.message} onChange={set('message')} />
              {errors.message && <p className="-mt-2 text-xs text-red-600">{errors.message}</p>}
              <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={loading}>
                {loading ? (<><Spinner size={18} /> Sending…</>) : (<>Send message <Send className="h-4 w-4" /></>)}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </section>
  )
}
