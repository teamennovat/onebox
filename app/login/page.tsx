'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, CheckCircle, ChevronRight, Sparkles, InboxIcon, Tags } from 'lucide-react'
import { FeatureCard } from '@/components/ui/feature-card'
import { ConnectAccountButton } from '@/components/ConnectAccountButton'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  // Check for authenticated user
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setUserId(session.user.id)
      } else {
        // If no session, redirect to sign in
        router.push('/auth/signin')
      }
    }
    checkUser()
  }, [])

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

      {/* Right Panel - Login */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Welcome to Onebox
            </h2>
            <p className="text-muted-foreground">
              Choose your email provider to get started
            </p>
          </div>

          <div className="space-y-4">
            <ConnectAccountButton
              provider="google"
              userId={userId || ''}
              disabled={loading || !userId}
            />
            <ConnectAccountButton
              provider="microsoft"
              userId={userId || ''}
              disabled={loading || !userId}
            />
            <ConnectAccountButton
              provider="yahoo"
              userId={userId || ''}
              disabled={loading || !userId}
            />
            <ConnectAccountButton
              provider="imap"
              userId={userId || ''}
              disabled={loading || !userId}
            />
          </div>

          <div className="mt-8 pt-6 border-t border-border">
            <div className="flex flex-col items-center gap-4 text-sm text-muted-foreground">
              <p className="text-center">
                By continuing, you agree to our{' '}
                <a href="#" className="text-primary hover:underline">Terms</a>
                {' '}and{' '}
                <a href="#" className="text-primary hover:underline">Privacy Policy</a>
              </p>
              <a href="#" className="text-primary hover:underline flex items-center gap-2">
                <span>Need help?</span>
                <ChevronRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}