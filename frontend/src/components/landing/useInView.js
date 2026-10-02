import { useEffect, useRef, useState } from 'react'

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Drives the landing motion graphics. Returns [ref, className]:
 *  - 'mg-wait' while off-screen: animated parts sit in their hidden start state
 *  - 'mg-in' once ~20% is visible: entrances + loops run
 *  - '' under reduced motion: no classes, so everything shows in its final state
 *
 * Unlike Reveal it replays: leaving the viewport fully re-arms the graphic, so
 * scrolling back to a section plays its animation again.
 */
export function useInView() {
  const ref = useRef(null)
  const [reduce] = useState(prefersReduced)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || reduce) return
    if (!('IntersectionObserver' in window)) {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.intersectionRatio >= 0.2) setInView(true)
        else if (!e.isIntersecting) setInView(false)
      },
      { threshold: [0, 0.2] }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [reduce])

  return [ref, reduce ? '' : inView ? 'mg-in' : 'mg-wait', reduce]
}

/**
 * 0 → 1 as the element scrolls up through the viewport (scrubbed, not
 * triggered). Starts when its top passes 85% of the viewport height.
 */
export function useScrollProgress() {
  const ref = useRef(null)
  const [reduce] = useState(prefersReduced)
  const [p, setP] = useState(reduce ? 1 : 0)

  useEffect(() => {
    if (reduce) return
    let raf = 0
    const update = () => {
      raf = 0
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight || 1
      const start = vh * 0.85
      const span = vh * 0.45 + r.height * 0.4
      const v = Math.min(1, Math.max(0, (start - r.top) / span))
      setP(Math.round(v * 1000) / 1000)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [reduce])

  return [ref, p]
}
