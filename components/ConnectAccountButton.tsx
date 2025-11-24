'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Mail, Loader2 } from 'lucide-react'

interface Props {
  provider: 'google' | 'microsoft' | 'yahoo' | 'imap'
  userId: string
  disabled?: boolean
}

const providerConfig = {
  google: { 
    name: 'Gmail', 
    icon: '/icons/google.svg', 
    bgColor: 'bg-white',
    iconClass: 'w-6 h-6',
    description: 'Connect your Gmail account'
  },
  microsoft: { 
    name: 'Outlook', 
    icon: '/icons/microsoft.svg',
    bgColor: 'bg-[#2F2F2F]',
    iconClass: 'w-6 h-6',
    description: 'Connect your Outlook account'
  },
  yahoo: { 
    name: 'Yahoo Mail', 
    icon: '/icons/yahoo.svg',
    bgColor: 'bg-[#5F01D1]',
    iconClass: 'w-6 h-6 text-white',
    description: 'Connect your Yahoo Mail account'
  },
  imap: { 
    name: 'Other Email', 
    icon: null,
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    iconClass: 'w-6 h-6 text-gray-600 dark:text-gray-300',
    description: 'Connect any IMAP email account'
  }
}

export function ConnectAccountButton({ provider, userId, disabled }: Props) {
  const [loading, setLoading] = useState(false)
  const config = providerConfig[provider]

  const handleConnect = async () => {
    setLoading(true)
    try {
      // Validate user ID
      if (!userId || userId.trim() === '') {
        console.error('❌ No user ID available for connection')
        throw new Error('Authentication required. Please sign in first.')
      }

      console.log(`🔗 Starting ${provider} OAuth connection`, {
        provider,
        userIdPrefix: userId.substring(0, 8) + '...',
        timestamp: new Date().toISOString()
      })
      
      // Initiate the OAuth flow
      const response = await fetch(`/api/auth/${provider}?userId=${encodeURIComponent(userId)}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        },
        credentials: 'include'
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error(`❌ OAuth URL generation failed for ${provider}:`, {
          status: response.status,
          error: errorData
        })
        throw new Error(
          errorData.error || 
          errorData.details || 
          `Failed to connect ${config.name}. Please try again.`
        )
      }
      
      const data = await response.json()
      
      if (!data.url) {
        console.error(`❌ No OAuth URL in response for ${provider}:`, data)
        throw new Error(`No authentication URL generated for ${config.name}`)
      }
      
      // Store connection context for post-auth flow
      try {
        sessionStorage.setItem('authReturnTo', window.location.pathname)
        sessionStorage.setItem('connectProvider', provider)
        sessionStorage.setItem('connectUserId', userId)
      } catch (e) {
        console.warn('⚠️ Could not store session data:', e)
      }
      
      console.log(`✅ OAuth URL generated for ${provider}, redirecting to Nylas...`)
      
      // Redirect to the OAuth URL
      window.location.href = data.url
    } catch (error) {
      console.error(`❌ Connection error for ${provider}:`, error instanceof Error ? error.message : error)
      alert(error instanceof Error ? error.message : `Failed to connect ${config.name}. Please try again.`)
      setLoading(false)
    }
  }

  return (
    <Button
      onClick={handleConnect}
      disabled={disabled || loading}
      className="w-full p-6 flex items-center justify-start space-x-4 bg-card hover:bg-accent/50 border border-border rounded-xl transform transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:border-primary/20"
      variant="ghost"
    >
      <div className={`h-12 w-12 rounded-lg ${config.bgColor} flex items-center justify-center shadow-sm`}>
        {config.icon ? (
          <img src={config.icon} alt={config.name} className={config.iconClass} />
        ) : (
          <Mail className={config.iconClass} />
        )}
      </div>
      <div className="flex-1 text-left">
        <div className="font-semibold">{config.name}</div>
        <div className="text-sm text-muted-foreground">{config.description}</div>
      </div>
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      ) : (
        <div className="h-8 w-8 rounded-full bg-accent/50 flex items-center justify-center">
          <Mail className="h-4 w-4 text-primary" />
        </div>
      )}
    </Button>
  )
}