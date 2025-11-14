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
      // First verify if we have a valid user ID
      if (!userId || userId === 'placeholder') {
        throw new Error('Please sign in to connect an email account')
      }

      // First, ensure we have a valid connector for this provider
      if (provider === 'google') {
        try {
          console.log('Setting up Google connector...')
          const connectorResponse = await fetch('/api/connectors/google', { 
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          })
          
          const connectorData = await connectorResponse.json()
          console.log('Connector setup response:', connectorData)
          
          // Check for specific error conditions
          if (!connectorResponse.ok) {
            if (connectorData.error?.includes('duplicate')) {
              // This is actually fine, we can continue
              console.log('Connector already exists, continuing...')
            } else {
              throw new Error(connectorData.error || 'Unknown connector error')
            }
          }
        } catch (error) {
          console.error('Connector setup error:', error)
          alert(error instanceof Error ? error.message : 'Failed to set up Google connector. Please try again.')
          return // Exit early instead of throwing
        }
      }

      console.log(`Initiating OAuth flow for provider: ${provider}`)
      // Then initiate the OAuth flow
      const response = await fetch(`/api/auth/${provider}?userId=${userId}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        console.error('Auth error:', errorData)
        throw new Error(errorData.error || 'Failed to initiate authentication')
      }
      
      const data = await response.json()
      
      if (!data.url) {
        console.error('Missing URL in response:', data)
        throw new Error('No authentication URL returned')
      }
      
      // Store the current URL to return to after auth
      sessionStorage.setItem('authReturnTo', window.location.pathname)
      
      // Log the URL we're redirecting to (for debugging)
      console.log('Redirecting to:', data.url)
      
      // Redirect to the OAuth URL
      window.location.href = data.url
    } catch (error) {
      console.error('Error connecting account:', error)
      alert(error instanceof Error ? error.message : 'Failed to connect account. Please try again.')
    } finally {
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