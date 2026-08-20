'use client'

import { useState } from 'react'
import { createNibgateWallet } from './appkit.js'

// Initializes the shared AppKit instance once and renders children. AppKit is
// adapter-less (no wagmi / react-query context needed), so the provider is just
// the initialization seam — the React context/hooks come from
// `@reown/appkit/react` directly.
export function NibgateWalletProvider({ children, ...options }) {
  useState(() => createNibgateWallet(options))
  return children
}