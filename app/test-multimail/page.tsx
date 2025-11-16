"use client"

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { formatDistanceToNow } from 'date-fns'
import { Mail, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

interface EmailResult {
  id: string
  subject: string
  from: Array<{ email: string; name?: string }>
  to: Array<{ email: string; name?: string }>
  snippet: string
  date: number
  unread: boolean
  starred: boolean
  accountId: string
  accountEmail: string
  accountProvider: string
  grantId: string
}

interface AccountResult {
  accountId: string
  email: string
  provider: string
  grantId: string
  success: boolean
  error?: string
  emails: EmailResult[]
  count: number
}

export default function TestMultimailPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<{
    totalAccounts: number
    totalEmails: number
    accountResults: AccountResult[]
    allEmails: EmailResult[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      try {
        const {
          data: { user: sessionUser },
        } = await supabase.auth.getUser()
        setUser(sessionUser)
      } catch (err) {
        console.error('Error getting user:', err)
        setError('Failed to get user info')
      }
    }

    getUser()
  }, [supabase])

  const handleFetchEmails = async () => {
    if (!user?.id) {
      setError('User not logged in')
      return
    }

    try {
      setLoading(true)
      setError(null)
      setResults(null)

      const response = await fetch(`/api/test/multimail?userId=${user.id}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch emails')
      }

      setResults(data)
    } catch (err) {
      console.error('Error fetching emails:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">🧪 Multi-Account Email Tester</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Fetch and display emails from all your connected accounts at once
          </p>
        </div>

        {/* User Info */}
        {user && (
          <div className="bg-white dark:bg-gray-900 rounded-lg p-4 mb-6 border border-gray-200 dark:border-gray-800">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Logged in as: <span className="font-semibold">{user.email}</span>
            </p>
          </div>
        )}

        {/* Fetch Button */}
        <div className="mb-8">
          <button
            onClick={handleFetchEmails}
            disabled={loading || !user}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
            {!loading && <Mail className="w-5 h-5" />}
            {loading ? 'Fetching Emails...' : 'Fetch from All Accounts'}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6 flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900 dark:text-red-100">Error</p>
              <p className="text-red-800 dark:text-red-300 text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Results Summary */}
        {results && (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 mb-8">
            <div className="grid grid-cols-3 gap-4 p-6 border-b border-gray-200 dark:border-gray-800">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Connected Accounts</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  {results.totalAccounts || 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Emails</p>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {results.totalEmails || 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Successful Accounts</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                  {(results.accountResults && results.accountResults.filter((a) => a.success).length) || 0}
                </p>
              </div>
            </div>

            {/* Account Results */}
            {results.accountResults && results.accountResults.length > 0 && (
              <div className="p-6 border-b border-gray-200 dark:border-gray-800">
                <h3 className="text-lg font-semibold mb-4">Account Fetch Results</h3>
                <div className="space-y-3">
                  {results.accountResults.map((account) => (
                    <div
                      key={account.accountId}
                      className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                    >
                      {account.success ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold truncate">{account.email}</p>
                          <span className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100">
                            {account.provider}
                          </span>
                        </div>
                        {account.success ? (
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            ✅ Fetched {account.count} emails
                          </p>
                        ) : (
                          <p className="text-sm text-red-600 dark:text-red-400">{account.error}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Emails List */}
        {results && results.allEmails && results.allEmails.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-semibold">All Emails ({results.allEmails.length})</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Sorted by date (newest first), showing 50 from each account
              </p>
            </div>

            <div className="divide-y divide-gray-200 dark:divide-gray-800 max-h-[600px] overflow-y-auto">
              {results.allEmails.map((email) => {
                const fromEmail = email.from?.[0]?.email || 'Unknown'
                const fromName = email.from?.[0]?.name || fromEmail

                return (
                  <div
                    key={`${email.grantId}-${email.id}`}
                    className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs px-2 py-1 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-900 dark:text-purple-100">
                            {email.accountProvider}
                          </span>
                          <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                            {email.accountEmail}
                          </span>
                          {email.unread && (
                            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                          )}
                          {email.starred && (
                            <span className="text-yellow-500">⭐</span>
                          )}
                        </div>
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {email.subject}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                          From: {fromName}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-500 line-clamp-2 mt-1">
                          {email.snippet}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-500 dark:text-gray-500 whitespace-nowrap">
                          {formatDistanceToNow(new Date(email.date * 1000), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {results && (!results.allEmails || results.allEmails.length === 0) && (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-12 text-center">
            <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">No emails found</p>
            {results.totalAccounts === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                Connect at least one email account to see emails
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
