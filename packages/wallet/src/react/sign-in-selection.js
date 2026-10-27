// Wait for an intentional choice in the shared Connect sheet. An address that
// was already connected before the sheet opened is not consent to sign SIWE.
export async function waitForSignInSelection({ read, initial, pause = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now }) {
  const started = now()
  let closedAt = null
  let pendingAt = null
  while (true) {
    const state = read()
    if (!state.mounted) return null
    // A selection event is mandatory; hydration or provider churn alone is
    // not consent. Reusing the unchanged wallet still needs explicit Sign in.
    const selected = state.selectionRevision > initial.selectionRevision
    const changed = !initial.connected || state.address?.toLowerCase() !== initial.address?.toLowerCase() || state.provider !== initial.provider
    const reconciled = initial.connected || !initial.provider || state.provider !== initial.provider
    if (selected && changed && reconciled && state.connected && state.address && state.provider) {
      return { address: state.address, provider: state.provider }
    }
    if (state.open) {
      closedAt = null
      pendingAt = null
    } else if (state.connecting) {
      pendingAt ??= now()
      if (now() - pendingAt >= 120000) return null
    } else {
      closedAt ??= now()
      // AppKit closes before its connector state has reconciled, especially
      // for Google/mobile. Preserve its existing six-second grace period.
      if (now() - closedAt >= 6000) return null
    }
    // If open() never resulted in a visible sheet, do not wait indefinitely.
    if (!state.open && !state.connecting && now() - started >= 30000) return null
    await pause(200)
  }
}
