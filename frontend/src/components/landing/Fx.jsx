import { gsap, ScrollTrigger, useGSAP, MOTION_OK, MOBILE } from './gsap'

/**
 * Split — renders a heading word-by-word so the page-level scroll FX can raise
 * each word out of its own mask. `parts` lets a phrase carry its own colour:
 *   <Split parts={['Hire smarter with', ['AI-driven interviews', 'text-brand-600']]} />
 */
export function Split({ parts, text, as: Tag = 'span', className = '' }) {
  const segs = parts ?? [text]
  const label = segs.map((s) => (Array.isArray(s) ? s[0] : s)).join(' ')
  return (
    <Tag className={className} data-split aria-label={label}>
      {segs.map((seg, si) => {
        const [str, cls] = Array.isArray(seg) ? seg : [seg, '']
        return str.split(' ').map((w, wi) => (
          <span key={`${si}-${wi}`} aria-hidden="true" className="inline-block overflow-hidden pb-[0.12em] -mb-[0.12em] align-bottom">
            <span className={`sw-i inline-block ${cls}`}>{w}&nbsp;</span>
          </span>
        ))
      })}
    </Tag>
  )
}

/**
 * Page-wide scroll FX. Call once from the page root, AFTER the pinned scenes
 * (child effects run first, so their pin spacing already exists).
 *  [data-split]          words rise out of masks
 *  [data-reveal]         element flips up into place
 *  [data-reveal-m]       same, phones only (pinned scenes own it on desktop)
 *  [data-stagger] > *    children cascade in
 *  [data-parallax="n"]   drifts n × scroll distance
 *  [data-count]          number counts up from 0
 *  .fx-progress          top scroll-progress bar
 * Every trigger reverses when scrolled back above it, so content re-enters.
 */
export function usePageFx(root) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        const toggle = 'play none none reverse'

        gsap.utils.toArray('[data-split]').forEach((el) => {
          gsap.from(el.querySelectorAll('.sw-i'), {
            yPercent: 115,
            rotate: 7,
            opacity: 0,
            duration: 1,
            ease: 'expo.out',
            stagger: 0.06,
            scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: toggle },
          })
        })

        gsap.utils.toArray('[data-reveal]').forEach((el) => {
          gsap.from(el, {
            y: 90,
            opacity: 0,
            rotateX: -18,
            scale: 0.94,
            transformPerspective: 900,
            transformOrigin: '50% 100%',
            duration: 1.1,
            ease: 'expo.out',
            delay: Number(el.dataset.reveal) || 0,
            scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: toggle },
          })
        })

      })

      // Elements a pinned desktop scene animates itself only reveal on phones.
      mm.add(MOBILE, () => {
        gsap.utils.toArray('[data-reveal-m]').forEach((el) => {
          gsap.from(el, {
            y: 90, opacity: 0, rotateX: -18, scale: 0.94, transformPerspective: 900,
            transformOrigin: '50% 100%', duration: 1.1, ease: 'expo.out',
            scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none reverse' },
          })
        })
      })

      mm.add(MOTION_OK, () => {
        const toggle = 'play none none reverse'
        gsap.utils.toArray('[data-stagger]').forEach((el) => {
          gsap.from(el.children, {
            y: 80,
            opacity: 0,
            scale: 0.9,
            rotateX: -20,
            transformPerspective: 900,
            duration: 1,
            ease: 'expo.out',
            stagger: 0.1,
            scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: toggle },
          })
        })

        gsap.utils.toArray('[data-parallax]').forEach((el) => {
          const k = Number(el.dataset.parallax) || 0
          gsap.to(el, {
            y: () => k * window.innerHeight,
            ease: 'none',
            scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
          })
        })

        gsap.utils.toArray('[data-count]').forEach((el) => {
          const end = Number(el.dataset.count)
          const suffix = el.dataset.suffix ?? ''
          const o = { v: 0 }
          gsap.to(o, {
            v: end,
            duration: 2,
            ease: 'power3.out',
            onUpdate: () => (el.textContent = Math.round(o.v) + suffix),
            scrollTrigger: { trigger: el, start: 'top 92%', toggleActions: 'play none none reset' },
          })
        })

        gsap.to('.fx-progress', {
          scaleX: 1,
          ease: 'none',
          scrollTrigger: { start: 0, end: 'max', scrub: 0.3 },
        })
      })

      // Pinned scenes were created first; re-order and re-measure everything.
      ScrollTrigger.sort()
      ScrollTrigger.refresh()
      const onLoad = () => ScrollTrigger.refresh()
      window.addEventListener('load', onLoad)
      return () => {
        window.removeEventListener('load', onLoad)
        mm.revert()
      }
    },
    { scope: root }
  )
}

/** Mouse-follow 3D tilt. Pointer-only; touch never fires it. */
export function useTilt(max = 10) {
  return {
    onPointerMove: (e) => {
      if (e.pointerType !== 'mouse') return
      const el = e.currentTarget
      const r = el.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width
      const py = (e.clientY - r.top) / r.height
      gsap.to(el, { rotateY: (px - 0.5) * max, rotateX: (0.5 - py) * max, transformPerspective: 1000, duration: 0.5, ease: 'power3.out' })
    },
    onPointerLeave: (e) => {
      gsap.to(e.currentTarget, { rotateY: 0, rotateX: 0, duration: 0.8, ease: 'elastic.out(1, 0.5)' })
    },
  }
}
