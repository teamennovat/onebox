'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

interface IMAPConfig {
  email: string
  password: string
  imapHost: string
  imapPort: string
  imapSecurity: 'SSL' | 'TLS' | 'STARTTLS'
  smtpHost: string
  smtpPort: string
  smtpSecurity: 'SSL' | 'TLS' | 'STARTTLS'
}

interface Props {
  onSubmit: (config: IMAPConfig) => Promise<void>
  onCancel: () => void
}

export function IMAPConfigForm({ onSubmit, onCancel }: Props) {
  const [loading, setLoading] = useState(false)
  const [config, setConfig] = useState<IMAPConfig>({
    email: '',
    password: '',
    imapHost: '',
    imapPort: '993',
    imapSecurity: 'SSL',
    smtpHost: '',
    smtpPort: '587',
    smtpSecurity: 'STARTTLS'
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onSubmit(config)
    } catch (error) {
      console.error('IMAP config error:', error)
      alert('Failed to configure IMAP account. Please check your settings.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-lg p-6 space-y-4">
        <h2 className="text-2xl font-semibold">Configure IMAP Account</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Email Address</label>
            <input
              type="email"
              required
              className="w-full p-2 border rounded bg-background"
              value={config.email}
              onChange={e => setConfig({ ...config, email: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Password</label>
            <input
              type="password"
              required
              className="w-full p-2 border rounded bg-background"
              value={config.password}
              onChange={e => setConfig({ ...config, password: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">IMAP Server</label>
              <input
                type="text"
                required
                placeholder="imap.example.com"
                className="w-full p-2 border rounded bg-background"
                value={config.imapHost}
                onChange={e => setConfig({ ...config, imapHost: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">IMAP Port</label>
              <input
                type="text"
                required
                className="w-full p-2 border rounded bg-background"
                value={config.imapPort}
                onChange={e => setConfig({ ...config, imapPort: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">SMTP Server</label>
              <input
                type="text"
                required
                placeholder="smtp.example.com"
                className="w-full p-2 border rounded bg-background"
                value={config.smtpHost}
                onChange={e => setConfig({ ...config, smtpHost: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">SMTP Port</label>
              <input
                type="text"
                required
                className="w-full p-2 border rounded bg-background"
                value={config.smtpPort}
                onChange={e => setConfig({ ...config, smtpPort: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">IMAP Security</label>
              <select
                className="w-full p-2 border rounded bg-background"
                value={config.imapSecurity}
                onChange={e => setConfig({ ...config, imapSecurity: e.target.value as any })}
              >
                <option value="SSL">SSL</option>
                <option value="TLS">TLS</option>
                <option value="STARTTLS">STARTTLS</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">SMTP Security</label>
              <select
                className="w-full p-2 border rounded bg-background"
                value={config.smtpSecurity}
                onChange={e => setConfig({ ...config, smtpSecurity: e.target.value as any })}
              >
                <option value="SSL">SSL</option>
                <option value="TLS">TLS</option>
                <option value="STARTTLS">STARTTLS</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end space-x-4 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect Account'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}