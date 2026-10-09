import { useEffect, useRef } from 'react'
import { Volume2, Bot, User, AlertTriangle, HelpCircle } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * The running conversation: questions, answers, and everything said around
 * them. This replaces the old single-question-on-a-card layout, which showed
 * the candidate one enormous sentence and no memory of what had already been
 * said — the reason the page felt like a form rather than an interview.
 *
 * The live question stays visually distinct at the bottom; everything above it
 * is history, dimmed so it reads as context rather than competing for
 * attention.
 */
export default function Transcript({ entries, speaking, onReplay }) {
  const endRef = useRef(null)

  // Follow the conversation as it grows, the way a chat does.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [entries.length, speaking])

  return (
    <div className="space-y-4">
      {entries.map((e, i) => {
        const isLast = i === entries.length - 1
        return (
          <Bubble
            key={`${e.kind}-${i}`}
            entry={e}
            live={isLast && e.side === 'ai'}
            speaking={speaking && isLast && e.side === 'ai'}
            onReplay={onReplay}
          />
        )
      })}
      <div ref={endRef} />
    </div>
  )
}

function Bubble({ entry, live, speaking, onReplay }) {
  const { side, kind, text, meta } = entry

  if (side === 'candidate') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%]">
          <div className="flex items-center justify-end gap-1.5 pr-1">
            <span className="text-[11px] font-semibold text-ink-400">You</span>
            <User className="h-3 w-3 text-ink-400" />
          </div>
          <div
            className={cn(
              'mt-1 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed',
              kind === 'aside'
                ? 'bg-amber-50 text-amber-900'
                : 'bg-brand-600 text-white'
            )}
          >
            {kind === 'aside' && (
              <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-70">
                <HelpCircle className="h-3 w-3" /> You asked
              </span>
            )}
            {text}
          </div>
          {/* Every answered question keeps its own score and feedback here.
              Previously only the most recent score was visible, in the sidebar,
              so a candidate had no way to see how question 2 had done once
              question 3 arrived — the marking was happening but never shown. */}
          {meta?.score != null && (
            <div className="mt-1.5 rounded-lg border border-ink-200 bg-ink-50/70 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                  {meta.order ? `Question ${meta.order}` : 'This answer'}
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
                    meta.score >= 75 ? 'bg-emerald-100 text-emerald-800'
                    : meta.score >= 50 ? 'bg-amber-100 text-amber-800'
                    : 'bg-red-100 text-red-800'
                  )}
                >
                  {meta.score}%
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-200">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    meta.score >= 75 ? 'bg-emerald-500'
                    : meta.score >= 50 ? 'bg-amber-500' : 'bg-red-500'
                  )}
                  style={{ width: `${meta.score}%` }}
                />
              </div>
              {meta.feedback && (
                <p className="mt-1.5 text-left text-[11px] leading-relaxed text-ink-500">
                  {meta.feedback}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Interviewer ──
  const isQuestion = kind === 'question'
  return (
    <div className="flex justify-start">
      <div className={cn('max-w-[92%]', live && isQuestion && 'w-full')}>
        <div className="flex items-center gap-1.5 pl-1">
          <span
            className={cn(
              'flex h-4 w-4 items-center justify-center rounded-full',
              meta?.source === 'hr' ? 'bg-brand-100 text-brand-700' : 'bg-ink-200 text-ink-600'
            )}
          >
            <Bot className="h-2.5 w-2.5" />
          </span>
          <span className="text-[11px] font-semibold text-ink-400">
            {meta?.source === 'hr' ? 'From the employer' : 'Interviewer'}
          </span>
          {speaking && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-brand-600">
              <SpeakingDots /> speaking
            </span>
          )}
        </div>

        <div
          className={cn(
            'mt-1 rounded-2xl rounded-tl-sm border px-4 py-3 leading-relaxed',
            // The question being answered right now is the only thing on the
            // page that needs to be read at a glance. Older turns shrink back.
            live && isQuestion
              ? 'border-ink-200 bg-white text-[15px] font-medium text-ink-900 shadow-sm'
              : kind === 'reply'
                ? 'border-transparent bg-ink-100/70 text-sm text-ink-700'
                : 'border-transparent bg-ink-50 text-sm text-ink-500'
          )}
        >
          {kind === 'reply' && meta?.intent === 'issue' && (
            <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              <AlertTriangle className="h-3 w-3" /> Noted
            </span>
          )}
          {text}
        </div>

        {live && (
          <button
            onClick={() => onReplay(text)}
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
          >
            <Volume2 className="h-3 w-3" /> Replay
          </button>
        )}
      </div>
    </div>
  )
}

function SpeakingDots() {
  return (
    <span className="flex items-end gap-0.5" aria-hidden="true">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-2.5 w-0.5 animate-pulse rounded-full bg-brand-500"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  )
}
