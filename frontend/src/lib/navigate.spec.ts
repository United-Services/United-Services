import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const push = vi.fn()
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push }),
}))

import { useAppNavigate, ROUTES } from './navigate'

// This mapping table caused a real regression once: 'client-signup' was
// pointed at Clerk's generic /sign-up page instead of our real 8-step
// ClientSignup wizard. These tests exist to catch that class of mistake
// (a route key silently mapping to the wrong path) before it ships again.
describe('useAppNavigate', () => {
  beforeEach(() => push.mockClear())

  it('routes every known page key to its declared path', () => {
    const { result } = renderHook(() => useAppNavigate())
    for (const [page, path] of Object.entries(ROUTES)) {
      result.current(page)
      expect(push).toHaveBeenLastCalledWith(path)
    }
  })

  it('sends client-signup to the real wizard, not the generic Clerk sign-up page', () => {
    const { result } = renderHook(() => useAppNavigate())
    result.current('client-signup')
    expect(push).toHaveBeenCalledWith('/client-signup')
  })

  it('falls back to "/" for an unknown page key', () => {
    const { result } = renderHook(() => useAppNavigate())
    result.current('not-a-real-page')
    expect(push).toHaveBeenCalledWith('/')
  })

  it('appends an encoded ?company= param only for the projects page', () => {
    const { result } = renderHook(() => useAppNavigate())
    result.current('projects', 'ADNOC & Co')
    expect(push).toHaveBeenCalledWith('/projects?company=ADNOC%20%26%20Co')

    result.current('about', 'ignored-param')
    expect(push).toHaveBeenLastCalledWith('/about')
  })

  it('appends an encoded ?position= param for candidate-signup', () => {
    const { result } = renderHook(() => useAppNavigate())
    result.current('candidate-signup', 'pos-123')
    expect(push).toHaveBeenCalledWith('/candidate-signup?position=pos-123')

    result.current('candidate-signup')
    expect(push).toHaveBeenLastCalledWith('/candidate-signup')
  })
})
