import { setupServer } from 'msw/node'
import { handlers } from './handlers'

/** Node-side mock API used by Vitest. */
export const server = setupServer(...handlers)
