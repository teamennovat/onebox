import { EmailProviderError, handleProviderError, shouldRetry, getRetryDelay } from '@/lib/provider-errors'

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  provider: string,
  maxAttempts = 3
): Promise<T> {
  let attempts = 0

  while (true) {
    try {
      return await operation()
    } catch (error) {
      attempts++
      
      const providerError = handleProviderError(error, provider)

      if (!shouldRetry(providerError) || attempts >= maxAttempts) {
        throw providerError
      }

      await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempts)))
    }
  }
}

export function handleApiError(error: unknown, provider: string) {
  if (error instanceof EmailProviderError) {
    return {
      error: error.userMessage,
      code: error.errorCode,
      status: 400
    }
  }

  // Log unexpected errors
  console.error(`Unexpected ${provider} error:`, error)
  
  return {
    error: 'An unexpected error occurred',
    code: 'internal_error',
    status: 500
  }
}