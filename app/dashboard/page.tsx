'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import dynamic from 'next/dynamic'
const MailWrapper = dynamic(() => import('./mail-wrapper'), { ssr: false })

interface EmailAccount {
  id: string
  grant_id: string
  email: string
  provider: string
  grant_status: string
}

interface Message {
  id: string
  subject: string
  from: { email: string; name: string }
  snippet: string
  date: string
}

export default function Dashboard() {
  const [supabaseClient] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  )
  const [user, setUser] = useState<any | null>(null)
  const router = useRouter()

  // Load current user from Supabase auth on client and listen for auth changes
  const checkAndFetchAccounts = useCallback(async () => {
    if (!user?.id) return

    try {
      const response = await fetch(`/api/accounts?userId=${user.id}`)
      const data = await response.json()
      
      if (response.ok) {
        setAccounts(data.accounts)
        // If we just connected a new account, select it
        const params = new URLSearchParams(window.location.search)
        const justConnected = params.get('email')
        const newAccount = data.accounts.find((acc: EmailAccount) => acc.email === justConnected)
        if (newAccount) {
          setSelectedAccount(newAccount)
        }
      } else {
        setError(data.error)
      }
    } catch (error) {
      setError('Failed to fetch accounts')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    let mounted = true

    async function checkUser() {
      try {
        const {
          data: { session },
          error,
        } = await supabaseClient.auth.getSession()

        if (error) {
          console.error('Session error:', error)
          throw error
        }

        if (!mounted) return

        if (!session?.user) {
          console.log('No session found, redirecting to signin')
          window.location.href = '/auth/signin'
          return
        }

        console.log('Session found for user:', session.user.email)
        setUser(session.user)

        // Pre-fetch accounts since we know we have a valid session
        const { data: accountsData, error: accountsError } = await supabaseClient
          .from('email_accounts')
          .select('*')
          .eq('user_id', session.user.id)

        if (!accountsError && accountsData) {
          setAccounts(accountsData)
        }
      } catch (err) {
        console.error('Auth error:', err)
        if (mounted) {
          setUser(null)
          window.location.href = '/auth/signin'
        }
      }
    }

    // Initial check
    checkUser()

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      console.log('Auth state changed:', event, session?.user?.email)

      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user)
        checkAndFetchAccounts()
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        window.location.href = '/auth/signin'
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [supabaseClient, checkAndFetchAccounts])

  // Fetch accounts whenever user changes
  useEffect(() => {
    if (user) {
      checkAndFetchAccounts()
    }
  }, [user, checkAndFetchAccounts])
  const searchParams = useSearchParams()
  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<EmailAccount | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch connected accounts
  const fetchAccounts = useCallback(async () => {
    if (!user?.id) return

    try {
      const response = await fetch(`/api/accounts?userId=${user.id}`)
      const data = await response.json()
      
      if (response.ok) {
        setAccounts(data.accounts)
        // If we just connected a new account, select it
  const justConnected = searchParams.get('email')
  const newAccount = data.accounts.find((acc: EmailAccount) => acc.email === justConnected)
        if (newAccount) {
          setSelectedAccount(newAccount)
        }
      } else {
        setError(data.error)
      }
    } catch (error) {
      setError('Failed to fetch accounts')
    } finally {
      setLoading(false)
    }
  }, [user?.id, searchParams])

  // Fetch messages for selected account
  const fetchMessages = useCallback(async (grantId: string) => {
    try {
      setLoading(true)
      const response = await fetch(`/api/messages?grantId=${grantId}&limit=50`)
      const data = await response.json()
      
      if (response.ok) {
        setMessages(data.data)
      } else {
        setError(data.error)
      }
    } catch (error) {
      setError('Failed to fetch messages')
    } finally {
      setLoading(false)
    }
  }, [])

  // Load accounts on mount
  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  // Load messages when account is selected
  useEffect(() => {
    if (selectedAccount) {
      fetchMessages(selectedAccount.grant_id)
    }
  }, [selectedAccount, fetchMessages])

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="p-4 text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <div>Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4">
      {/* Success message */}
  {searchParams.get('success') === 'account_connected' && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-4">
          Successfully connected {searchParams.get('email')}!
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
          {error}
        </div>
      )}

      {/* Account selection */}
      {/* Mail UI using existing accounts/messages data */}
      <div className="mb-8">
        <MailWrapper accounts={accounts} mails={messages} />
      </div>

      {/* Messages list */}
      {selectedAccount && (
        <div>
          <h3 className="text-lg font-bold mb-4">
            Messages for {selectedAccount.email}
          </h3>
          {loading ? (
            <div>Loading messages...</div>
          ) : (
            <div className="space-y-4">
              {messages.map(message => (
                <div
                  key={message.id}
                  className="p-4 border rounded-lg hover:shadow-md"
                >
                  <div className="font-bold">{message.subject}</div>
                  <div className="text-sm text-gray-600">
                    From: {message.from.name} ({message.from.email})
                  </div>
                  <div className="text-sm mt-2">{message.snippet}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(message.date).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}