import { Skeleton } from "../ui/skeleton"

export function MailListSkeleton() {
  return (
    <div className="flex flex-col divide-y">
      {Array.from({ length: 8 }).map((_, i) => (
        <div 
          key={i}
          className="flex items-start gap-4 p-4 hover:bg-accent/5 transition-colors"
        >
          {/* Avatar and Read Status */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-shrink-0 w-2 h-2">
              <Skeleton className="h-2 w-2 rounded-full" />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* From and Time */}
            <div className="flex items-center justify-between mb-1">
              <Skeleton className="h-4 w-[120px]" />
              <Skeleton className="h-4 w-[60px]" />
            </div>
            
            {/* Subject */}
            <Skeleton className="h-4 w-[80%] mb-1" />
            
            {/* Preview text with gradient fade */}
            <div className="relative">
              <Skeleton className="h-4 w-[90%]" />
            </div>
          </div>

          {/* Action icons */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}