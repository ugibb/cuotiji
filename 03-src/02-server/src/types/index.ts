// Shared response types

export interface ApiResponse<T = unknown> {
  success: boolean
  data: T | null
  error: string | null
  meta?: {
    total?: number
    page?: number
    limit?: number
  }
}

export function ok<T>(data: T, meta?: ApiResponse['meta']): ApiResponse<T> {
  return { success: true, data, error: null, meta }
}

export function fail(error: string, data: null = null): ApiResponse<null> {
  return { success: false, data, error }
}

// JWT payload
export interface JwtPayload {
  userId: number
  openid: string
}
