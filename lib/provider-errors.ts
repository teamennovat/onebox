export class EmailProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public errorCode: string,
    public userMessage: string
  ) {
    super(message)
    this.name = 'EmailProviderError'
  }
}

export function handleProviderError(error: any, provider: string): EmailProviderError {
  // Google-specific errors
  if (provider === 'google') {
    if (error.code === 'invalid_grant') {
      return new EmailProviderError(
        'Google OAuth grant invalid or expired',
        'google',
        'invalid_grant',
        'Your Google account access has expired. Please reconnect your account.'
      )
    }
    if (error.code === 'access_denied') {
      return new EmailProviderError(
        'Google access denied by user',
        'google',
        'access_denied',
        'Access to your Google account was denied. Please try again and allow the required permissions.'
      )
    }
  }

  // Microsoft-specific errors
  if (provider === 'microsoft') {
    if (error.code === 'AADSTS65001') {
      return new EmailProviderError(
        'Microsoft consent required',
        'microsoft',
        'consent_required',
        'Additional permissions are required for your Microsoft account. Please reconnect.'
      )
    }
    if (error.code === 'AADSTS50020') {
      return new EmailProviderError(
        'Microsoft user account disabled',
        'microsoft',
        'account_disabled',
        'Your Microsoft account appears to be disabled. Please check your account status.'
      )
    }
  }

  // Yahoo-specific errors
  if (provider === 'yahoo') {
    if (error.code === 'unauthorized_client') {
      return new EmailProviderError(
        'Yahoo OAuth client unauthorized',
        'yahoo',
        'unauthorized_client',
        'There was a problem connecting to Yahoo. Please try again later.'
      )
    }
  }

  // IMAP-specific errors
  if (provider === 'imap') {
    if (error.message?.includes('authentication failed')) {
      return new EmailProviderError(
        'IMAP authentication failed',
        'imap',
        'auth_failed',
        'Invalid email or password. Please check your credentials.'
      )
    }
    if (error.message?.includes('connection refused')) {
      return new EmailProviderError(
        'IMAP connection refused',
        'imap',
        'connection_failed',
        'Could not connect to the email server. Please verify your server settings.'
      )
    }
  }

  // Generic error fallback
  return new EmailProviderError(
    error.message || 'Unknown error occurred',
    provider,
    'unknown_error',
    'An unexpected error occurred. Please try again later.'
  )
}

export function isTemporaryError(error: EmailProviderError): boolean {
  const temporaryErrors = [
    'connection_failed',
    'rate_limit_exceeded',
    'server_error'
  ]
  return temporaryErrors.includes(error.errorCode)
}

export function shouldRetry(error: EmailProviderError): boolean {
  return isTemporaryError(error) && error.errorCode !== 'auth_failed'
}

export function getRetryDelay(attempts: number): number {
  return Math.min(1000 * Math.pow(2, attempts), 30000) // Exponential backoff up to 30 seconds
}