/** @module @deepseek-ai/dsh-desktop-browser/invariant */

import type { Context } from '@deepseek-ai/cordis'

export const name = 'desktop-browser-invariant'
export const inject = ['invariants'] as const

export const apply = (_ctx: Context): Promise<() => void> => Promise.resolve(() => {})
