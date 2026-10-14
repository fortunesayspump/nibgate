'use client'

// Small, theme-aware confirmation shared by payment surfaces. Motion is an
// enhancement: the final checkmark is visible even when animation is disabled.
export function PaymentFeedbackStyles() {
  return <style>{`
    @media (prefers-reduced-motion: no-preference) {
      [data-nibgate-confirmation] { animation: nibgate-confirm-in 320ms ease-out; }
      [data-nibgate-confirmation] path { animation: nibgate-confirm-draw 320ms ease-out; }
    }
    @keyframes nibgate-confirm-in {
      from { opacity: 0; transform: scale(.8); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes nibgate-confirm-draw {
      from { stroke-dasharray: 1; stroke-dashoffset: 1; }
      to { stroke-dasharray: 1; stroke-dashoffset: 0; }
    }
  `}</style>
}

export function ConfirmationMark({ size = 18 }) {
  return (
    <svg data-nibgate-confirmation width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      <circle cx="12" cy="12" r="9" opacity=".35" />
      <path d="m8 12 3 3 5-6" pathLength="1" />
    </svg>
  )
}
