import { Bot, Send } from 'lucide-react'
import { useInView } from './useInView'

// [who, text, delay ms]. Each bot reply is preceded by a typing indicator
// that occupies the reply's own slot, so nothing jumps when it lands.
const THREAD = [
  ['me', 'Can I give the interview in Urdu?', 200],
  ['bot', 'Haan bilkul! English aur Urdu dono supported hain.', 2000],
  ['me', 'Is it free?', 3000],
  ['bot', 'Free during beta, for candidates and recruiters both. 🎉', 4800],
]

/** FAQ: a short assistant conversation that types itself out. */
export default function ChatDemo() {
  const [ref, mg] = useInView()

  return (
    <div ref={ref} className={`mx-auto w-full max-w-sm ${mg}`} aria-hidden="true">
      <div className="mg-rise card-base overflow-hidden rounded-3xl">
        <div className="flex items-center gap-2.5 border-b border-brand-100 px-4 py-3">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white">
            <Bot className="h-4 w-4" />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-brand-400" />
          </span>
          <div>
            <div className="text-sm font-semibold text-ink-900">IntivraBot Assistant</div>
            <div className="text-[11px] text-brand-600">online</div>
          </div>
        </div>

        <div className="space-y-2.5 px-4 py-4">
          {THREAD.map(([who, text, d]) =>
            who === 'me' ? (
              <div key={text} className="flex justify-end">
                <p className="mg-rise max-w-[80%] rounded-2xl rounded-br-sm bg-brand-600 px-3 py-2 text-xs text-white" style={{ '--d': `${d}ms` }}>
                  {text}
                </p>
              </div>
            ) : (
              <div key={text} className="relative">
                <span className="mg-typing mg-dots absolute left-0 top-0 inline-flex gap-1 rounded-2xl rounded-bl-sm bg-brand-50 px-3 py-2.5" style={{ '--d': `${d - 1200}ms` }}>
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                </span>
                <p className="mg-rise max-w-[85%] rounded-2xl rounded-bl-sm bg-brand-50 px-3 py-2 text-xs text-ink-900" style={{ '--d': `${d}ms` }}>
                  {text}
                </p>
              </div>
            )
          )}
        </div>

        <div className="mx-4 mb-4 flex items-center gap-2 rounded-full border border-brand-100 bg-white px-3 py-2">
          <span className="flex-1 text-xs text-ink-400">Ask anything…</span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white">
            <Send className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </div>
  )
}
