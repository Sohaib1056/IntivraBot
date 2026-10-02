import { useInView } from './useInView'

const FLIGHT = 'M30 128 C 90 140, 100 50, 160 70 S 240 130, 284 46'
const DUR = '3.6s'

/** Contact: a paper plane flies from Gujranwala to the inbox, which bounces and
 *  ripples on arrival. Uses SMIL so the plane follows the curve exactly and
 *  every part shares one clock. */
export default function ContactFlight() {
  const [ref, mg, reduce] = useInView()

  return (
    <div ref={ref} className={`relative overflow-hidden rounded-2xl border border-brand-100 bg-brand-50 ${mg}`} aria-hidden="true">
      <svg viewBox="0 0 320 170" preserveAspectRatio="xMidYMid meet" className="block h-32 w-full">

        {/* flight path — marching dashes */}
        <path id="mg-flight" d={FLIGHT} fill="none" stroke="#ea580c" strokeWidth="1.5" strokeDasharray="4 6">
          {!reduce && <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="1s" repeatCount="indefinite" />}
        </path>

        {/* origin pin (drops in when scrolled to) */}
        <g className="mg-drop" style={{ transformBox: 'fill-box' }}>
          <circle cx="30" cy="128" r="10" fill="#fed7aa">
            {!reduce && <animate attributeName="r" values="6;14;6" dur="2s" repeatCount="indefinite" />}
          </circle>
          <path d="M30 132 c-6-7-9-11-9-15a9 9 0 0 1 18 0c0 4-3 8-9 15z" fill="#ea580c" />
          <circle cx="30" cy="117" r="3.2" fill="#fff" />
        </g>
        <text x="44" y="146" fill="#64748b" fontSize="9" fontWeight="600">Gujranwala, PK</text>

        {/* inbox */}
        <g transform="translate(284 46)">
          <circle r="12" fill="none" stroke="#fb923c" strokeWidth="1.5" opacity="0">
            {!reduce && (
              <>
                <animate attributeName="r" values="12;12;30;30" keyTimes="0;0.74;1;1" dur={DUR} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;0;0.8;0" keyTimes="0;0.74;0.76;1" dur={DUR} repeatCount="indefinite" />
              </>
            )}
          </circle>
          <g>
            <rect x="-15" y="-11" width="30" height="22" rx="4" fill="#fff" stroke="#ea580c" strokeWidth="1.5" />
            <path d="M-15 -8 L0 3 L15 -8" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinejoin="round" />
            {!reduce && (
              <animateTransform attributeName="transform" type="scale" values="1;1;1.25;0.95;1;1" keyTimes="0;0.74;0.8;0.86;0.92;1" dur={DUR} repeatCount="indefinite" />
            )}
          </g>
        </g>
        <text x="306" y="80" textAnchor="end" fill="#64748b" fontSize="9" fontWeight="600">hello@intivrabot.app</text>

        {/* the plane */}
        <g transform={reduce ? 'translate(250 60) rotate(-30)' : undefined}>
          <path d="M-9 -7 L11 0 L-9 7 L-5 0 Z" fill="#ea580c" />
          <path d="M-5 0 L11 0 L-9 7 Z" fill="#c2410c" />
          {!reduce && (
            <>
              <animateMotion dur={DUR} repeatCount="indefinite" rotate="auto" keyPoints="0;1;1" keyTimes="0;0.74;1" calcMode="linear">
                <mpath href="#mg-flight" />
              </animateMotion>
              <animate attributeName="opacity" values="1;1;0;0;1" keyTimes="0;0.72;0.76;0.98;1" dur={DUR} repeatCount="indefinite" />
            </>
          )}
        </g>
      </svg>
    </div>
  )
}
