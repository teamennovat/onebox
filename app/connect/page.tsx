'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, ChevronLeft, Sparkles, InboxIcon, Tags } from 'lucide-react'
import { FeatureCard } from '@/components/ui/feature-card'
import { ConnectAccountButton } from '@/components/ConnectAccountButton'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

export default function ConnectPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Check for authenticated user - with proper session validation
  useEffect(() => {
    let isMounted = true

    const checkUser = async () => {
      try {
        console.log('🔍 Checking user session on /connect...')
        
        // Try to get session - may need to refresh
        let { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) {
          console.error('❌ Session error:', sessionError)
          // Try refreshing session
          await supabase.auth.refreshSession()
          const result = await supabase.auth.getSession()
          session = result.data.session
        }
        
        if (!isMounted) return

        if (!session?.user?.id) {
          console.warn('⚠️ No authenticated user found after refresh attempt')
          // Give it one more moment
          await new Promise(resolve => setTimeout(resolve, 800))
          
          // Check one more time
          const { data: { session: retrySession } } = await supabase.auth.getSession()
          if (!retrySession?.user?.id && isMounted) {
            console.log('❌ Redirecting to signin - no session found')
            router.push('/auth/signin')
            return
          }
          if (retrySession?.user?.id && isMounted) {
            setUserId(retrySession.user.id)
            setError(null)
            setIsChecking(false)
            return
          }
        }

        console.log('✅ User session authenticated:', {
          userId: session?.user?.id,
          email: session?.user?.email
        })
        
        if (isMounted) {
          setUserId(session?.user?.id || null)
          setError(null)
          setIsChecking(false)
        }
      } catch (err) {
        console.error('❌ Error checking user:', err)
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Session check failed')
          setIsChecking(false)
        }
      }
    }
    
    checkUser()
    
    return () => {
      isMounted = false
    }
  }, [router])

  const features = [
    {
      title: 'Smart AI Email Management',
      description: 'Intelligent email categorization and automated responses',
      icon: Sparkles
    },
    {
      title: 'Universal Inbox',
      description: 'All your email accounts in one place',
      icon: InboxIcon
    },
    {
      title: 'Automated Labels',
      description: 'Smart categorization with AI-powered labeling',
      icon: Tags
    }
  ]

  const handleSkip = () => {
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left Panel - Features */}
      <div className="hidden lg:flex w-[45%] bg-sidebar p-12 flex-col justify-between relative overflow-hidden">
        <div className="relative z-10">
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-8">
              <Mail className="w-8 h-8 text-primary" />
              <h1 className="text-2xl font-bold text-sidebar-foreground">Onebox</h1>
            </div>
            <h2 className="text-4xl font-bold text-sidebar-foreground mb-4">
              Unify Your Email Experience
            </h2>
            <p className="text-lg text-sidebar-foreground/80">
              Connect unlimited email accounts and manage everything in one place
            </p>
          </div>

          <div className="space-y-8">
            {features.map((feature, index) => (
              <FeatureCard
                key={index}
                title={feature.title}
                description={feature.description}
                icon={feature.icon}
              />
            ))}
          </div>
        </div>

        {/* Testimonial */}
        <div className="relative z-10 bg-sidebar-accent/30 p-6 rounded-xl backdrop-blur-sm">
          <p className="text-sidebar-foreground/90 italic mb-4">
            "Onebox has transformed how I manage my emails. The AI features are game-changing!"
          </p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10" />
            <div>
              <p className="font-medium text-sidebar-foreground">Sarah Chen</p>
              <p className="text-sm text-sidebar-foreground/70">Product Manager, TechCo</p>
            </div>
          </div>
        </div>

        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
      </div>

      {/* Right Panel - Connect Accounts */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">
                Connect Email Accounts
              </h2>
              <p className="text-muted-foreground">
                Add your email accounts to get started
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="ml-auto"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-4 mb-6">
            <ConnectAccountButton
              provider="google"
              userId={userId || ''}
              disabled={loading || isChecking || !userId}
            />
            <ConnectAccountButton
              provider="microsoft"
              userId={userId || ''}
              disabled={loading || isChecking || !userId}
            />
            <ConnectAccountButton
              provider="yahoo"
              userId={userId || ''}
              disabled={loading || isChecking || !userId}
            />
            <ConnectAccountButton
              provider="imap"
              userId={userId || ''}
              disabled={loading || isChecking || !userId}
            />
          </div>

          <div className="border-t border-border pt-6">
            <Button
              onClick={handleSkip}
              variant="outline"
              className="w-full"
            >
              Skip for now
            </Button>
          </div>

          <div className="mt-8 text-center text-sm text-muted-foreground">
            <p>
              By continuing, you agree to our{' '}
              <a href="#" className="text-primary hover:underline">Terms</a>
              {' '}and{' '}
              <a href="#" className="text-primary hover:underline">Privacy Policy</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
