import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

/** Dev-only service worker so the CMS runs with no backend attached. */
export const worker = setupWorker(...handlers)
