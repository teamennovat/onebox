"use client"

import { Skeleton } from "../ui/skeleton"

export function FoldersSkeleton() {
  return (
    <div className="space-y-2 px-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-2 py-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-[100px]" />
          </div>
          <Skeleton className="h-4 w-8" />
        </div>
      ))}
    </div>
  )
}