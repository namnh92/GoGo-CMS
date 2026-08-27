import { z } from 'zod'

/** The BFF error envelope — identical on every non-2xx response. */
export const errorEnvelopeSchema = z.object({
  code: z.string(),
  message: z.string(),
  field_errors: z
    .array(z.object({ field: z.string(), code: z.string(), message: z.string() }))
    .default([]),
  request_id: z.string().default(''),
  retryable: z.boolean().default(false),
})

export type FieldError = { field: string; code: string; message: string }

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly fieldErrors: FieldError[]
  readonly requestId: string
  readonly retryable: boolean

  constructor(init: {
    code: string
    message: string
    status: number
    fieldErrors?: FieldError[]
    requestId?: string
    retryable?: boolean
  }) {
    super(init.message)
    this.name = 'ApiError'
    this.code = init.code
    this.status = init.status
    this.fieldErrors = init.fieldErrors ?? []
    this.requestId = init.requestId ?? ''
    this.retryable = init.retryable ?? false
  }

  get isForbidden(): boolean {
    return this.status === 403
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }

  get isConflict(): boolean {
    return this.status === 409
  }

  get isNetwork(): boolean {
    return this.status === 0
  }
}

/** Maps a thrown value to the ApiError the UI layer knows how to render. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  return new ApiError({
    code: 'UNKNOWN',
    message: error instanceof Error ? error.message : String(error),
    status: 0,
    retryable: true,
  })
}
