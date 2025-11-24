'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createBrowserClient } from '@supabase/ssr'

export default function SignInPage() {
  const router = useRouter()
  const [supabaseClient] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      console.log('🔐 Attempting sign in for:', email)
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        console.error('❌ Sign in failed:', error)
        throw error
      }

      console.log('✅ Sign in successful, session data:', {
        userId: data.user?.id,
        email: data.user?.email
      })

      // Wait for session to be properly persisted to cookies
      await new Promise(resolve => setTimeout(resolve, 300))

      // Verify session is available before redirecting
      const { data: { session } } = await supabaseClient.auth.getSession()
      if (!session) {
        console.warn('⚠️ Session not available after signin, retrying...')
        await new Promise(resolve => setTimeout(resolve, 300))
      }

      console.log('🔄 Redirecting to /connect')
      // Use router.push for better client-side handling
      router.push('/connect')
      
      // Also set window.location as fallback after a delay
      setTimeout(() => {
        window.location.href = '/connect'
      }, 500)
    } catch (error) {
      console.error('❌ Sign in error:', error)
      setError(error instanceof Error ? error.message : 'Failed to sign in')
      setLoading(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      })

      if (error) throw error

      alert('Please check your email for verification link')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to sign up')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8 space-y-6">
        <div className="flex items-center gap-3 justify-center mb-8">
          <Mail className="w-8 h-8 text-primary" />
          <h1 className="text-2xl font-bold">Onebox</h1>
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="space-y-4">
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleSignUp}
              disabled={loading}
            >
              Create account
            </Button>
          </div>
        </form>

        <div className="text-center text-sm text-muted-foreground">
          <p>
            By continuing, you agree to our{' '}
            <a href="#" className="text-primary hover:underline">Terms</a>
            {' '}and{' '}
            <a href="#" className="text-primary hover:underline">Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  )
}