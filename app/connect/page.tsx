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

  // Check for authenticated user
  useEffect(() => {
    const checkUser = async () => {
      try {
        setIsChecking(true)
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Session error:', error)
          // Redirect to signin if no session
          router.push('/auth/signin')
          return
        }
        
        if (session?.user?.id) {
          console.log('✅ User session found:', session.user.id)
          setUserId(session.user.id)
        } else {
          console.warn('⚠️ No user in session, redirecting to signin')
          router.push('/auth/signin')
        }
      } catch (error) {
        console.error('Error checking user:', error)
        router.push('/auth/signin')
      } finally {
        setIsChecking(false)
      }
    }
    
    checkUser()
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
              disabled={loading || isChecking}
            />
            <ConnectAccountButton
              provider="microsoft"
              userId={userId || ''}
              disabled={loading || isChecking}
            />
            <ConnectAccountButton
              provider="yahoo"
              userId={userId || ''}
              disabled={loading || isChecking}
            />
            <ConnectAccountButton
              provider="imap"
              userId={userId || ''}
              disabled={loading || isChecking}
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
