"use client"

import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"

interface MailSearchBarProps {
  searchText: string
  onSearchChange: (text: string) => void
  onSearchSubmit: () => void
  onSearchClear: () => void
  onFilterOpen: () => void
}

export function MailSearchBar({
  searchText,
  onSearchChange,
  onSearchSubmit,
  onSearchClear,
  onFilterOpen,
}: MailSearchBarProps) {
  return (
    <div className="bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search emails..."
          className="pl-8 pr-20"
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onSearchSubmit()
            }
          }}
        />
        <div className="absolute right-2 top-[0.25rem] flex items-center gap-1">
          {searchText && (
            <button
              type="button"
              onClick={onSearchClear}
              className="p-1 rounded hover:bg-accent/30 text-muted-foreground hover:text-foreground transition-colors"
              title="Clear search"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Clear search</span>
            </button>
          )}
          <button
            type="button"
            onClick={onSearchSubmit}
            disabled={!searchText}
            className="p-1 rounded hover:bg-accent/30 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            title="Search"
          >
            <Search className="h-4 w-4" />
            <span className="sr-only">Search</span>
          </button>
          <button
            type="button"
            onClick={onFilterOpen}
            className="p-1 rounded hover:bg-accent/30"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 4h18M6 12h12M10 20h4"
              />
            </svg>
            <span className="sr-only">Open filters</span>
          </button>
        </div>
      </div>
    </div>
  )
}
