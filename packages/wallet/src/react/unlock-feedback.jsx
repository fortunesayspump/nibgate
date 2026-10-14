'use client'

import { ConfirmationMark, PaymentFeedbackStyles } from './payment-feedback.jsx'

export function UnlockFeedbackStyles() {
  return <>
    <PaymentFeedbackStyles />
    <style>{`
      @media (prefers-reduced-motion: no-preference) {
        [data-nibgate-unlock-success] { animation: nibgate-unlock-success 600ms ease both; }
        [data-nibgate-unlock-content="new"] { animation: nibgate-unlock-reveal 280ms ease-out both; }
      }
      @keyframes nibgate-unlock-success {
        0% { opacity: 0; transform: translateY(4px); }
        25%, 72% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-3px); }
      }
      @keyframes nibgate-unlock-reveal {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `}</style>
  </>
}

export function UnlockConfirmation({ minHeight }) {
  return (
    <div data-nibgate-unlock-success role="status" aria-live="polite" aria-atomic="true" style={{
      minHeight: minHeight || 360, width: '100%', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 14, padding: 'clamp(32px, 8vw, 52px)', textAlign: 'center',
      fontFamily: 'var(--font-content, inherit)', color: 'var(--accent, #7c9a6d)',
    }}>
      <ConfirmationMark size={56} />
      <div style={{ fontSize: 23, fontWeight: 600, color: 'var(--fg, #0a0a0a)' }}>Unlocked</div>
      <div style={{ fontSize: 15, color: 'var(--muted, #6b6862)' }}>Your content is ready.</div>
    </div>
  )
}
