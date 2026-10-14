'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export const UNLOCK_CONFIRM_MS = 600
export const UNLOCK_REDUCED_CONFIRM_MS = 120

export function isVerifiedUnlock(result) {
  // The generic SDK also supports non-JSON resources, so its outer `ok`
  // alone is not the JSON access API's explicit verification signal.
  return result?.ok === true && (result.self === true || result.payload?.ok === true)
}

// Presentation only. The access verifier calls this after it has granted
// access; a submitted transaction or pending proof must never reach this path.
export function useUnlockReveal({ scope, onUnlock }) {
  const [view, setView] = useState({ scope, phase: 'locked' })
  const phase = view.scope === scope ? view.phase : 'locked'
  const [generation, setGeneration] = useState(0)
  const generationRef = useRef(0)
  const phaseRef = useRef('locked')
  const resultRef = useRef(null)
  const callbackRef = useRef(onUnlock)
  const activeRef = useRef(false)
  const scopeRef = useRef(scope)
  callbackRef.current = onUnlock
  scopeRef.current = scope

  useEffect(() => {
    activeRef.current = true
    phaseRef.current = 'locked'
    resultRef.current = null
    setView({ scope, phase: 'locked' })
    return () => { activeRef.current = false }
  }, [scope])

  const onVerified = useCallback((result, { restored = false } = {}) => {
    if (!activeRef.current || scopeRef.current !== scope || generationRef.current !== generation || !isVerifiedUnlock(result)) return
    // A concurrent access recheck must not cut short or replay confirmation.
    if (phaseRef.current !== 'locked') return
    resultRef.current = result
    phaseRef.current = restored ? 'restored' : 'confirmed'
    setView({ scope, phase: phaseRef.current })
  }, [scope, generation])

  const reset = useCallback(() => {
    generationRef.current += 1
    setGeneration(generationRef.current)
    phaseRef.current = 'locked'
    resultRef.current = null
    setView({ scope, phase: 'locked' })
  }, [scope])

  useEffect(() => {
    if (phase !== 'confirmed' && phase !== 'restored') return
    let cancelled = false
    const reveal = () => {
      if (cancelled || !activeRef.current || scopeRef.current !== scope || generationRef.current !== generation) return
      const result = resultRef.current
      phaseRef.current = phase === 'restored' ? 'restored-content' : 'revealed'
      setView({ scope, phase: phaseRef.current })
      // Hosts may replace/unmount the gate here. Notify only after the short
      // confirmation, and never let a host callback turn paid access into an error.
      const reportCallbackError = (error) => console.error('Nibgate onUnlock callback failed.', error)
      try { Promise.resolve(callbackRef.current?.(result)).catch(reportCallbackError) } catch (error) { reportCallbackError(error) }
    }
    if (phase === 'restored') {
      reveal()
      return () => { cancelled = true }
    }
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const timer = setTimeout(reveal, reduced ? UNLOCK_REDUCED_CONFIRM_MS : UNLOCK_CONFIRM_MS)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [phase, scope, generation])

  return { phase, onVerified, reset }
}
