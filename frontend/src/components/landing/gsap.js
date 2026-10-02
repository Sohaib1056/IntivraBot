import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, useGSAP)

// Shared breakpoints for gsap.matchMedia — pinned / horizontal scenes only run
// on wide screens; phones get plain scroll reveals.
export const MOTION_OK = '(prefers-reduced-motion: no-preference)'
export const DESKTOP = '(min-width: 1024px) and (prefers-reduced-motion: no-preference)'
export const MOBILE = '(max-width: 1023px) and (prefers-reduced-motion: no-preference)'

export { gsap, ScrollTrigger, useGSAP }
