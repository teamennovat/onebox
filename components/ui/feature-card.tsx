import { LucideIcon } from 'lucide-react'

interface FeatureCardProps {
  title: string
  description: string
  icon: LucideIcon
}

export function FeatureCard({ title, description, icon: Icon }: FeatureCardProps) {
  return (
    <div className="flex items-start gap-4 bg-sidebar-accent/40 p-4 rounded-xl backdrop-blur-sm">
      <div className="p-2 rounded-lg bg-primary/10">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <div>
        <h3 className="font-semibold text-sidebar-foreground mb-1">
          {title}
        </h3>
        <p className="text-sidebar-foreground/70 text-sm">
          {description}
        </p>
      </div>
    </div>
  )
}