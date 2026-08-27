import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import { server } from './src/shared/test/server'

// Every test runs against the same mock contract the dev server uses.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  window.localStorage.clear()
})
afterAll(() => server.close())

// jsdom ships neither of these and both are used by the shell.
if (!('randomUUID' in crypto)) {
  Object.defineProperty(crypto, 'randomUUID', {
    value: () => `test-${Math.random().toString(16).slice(2)}`,
  })
}
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}
