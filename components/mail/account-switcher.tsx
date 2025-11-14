"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface AccountSwitcherProps {
  isCollapsed: boolean
  accounts: {
    label: string
    email: string
    icon: React.ReactNode
    grantId: string
  }[]
  onAccountChange?: (grantId: string) => void
}

export function AccountSwitcher({
  isCollapsed,
  accounts,
  onAccountChange,
}: AccountSwitcherProps) {
  const router = useRouter()
  // Always start with placeholder selected on initial render and reload
  const [selectedAccount, setSelectedAccount] = React.useState<string>("none")
  const [hasRestoredAccount, setHasRestoredAccount] = React.useState(false)
  
  // Reset to 'none' on reload or dashboard mount
  React.useEffect(() => {
    setSelectedAccount("none")
    setHasRestoredAccount(false)
    localStorage.removeItem("lastSelectedAccount")
  }, [])

  // When accounts become available, attempt to restore last selected or pick first
  // Only run this ONCE after accounts load, not on every render
  React.useEffect(() => {
    if (!accounts || accounts.length === 0 || hasRestoredAccount) return
    
    try {
      const last = typeof window !== 'undefined' ? localStorage.getItem('lastSelectedAccount') : null
      if (last && accounts.some(a => a.grantId === last)) {
        setSelectedAccount(last)
        setHasRestoredAccount(true)
        onAccountChange?.(last)
      }
    } catch (e) {
      // ignore storage errors
    }
  }, [accounts.length, hasRestoredAccount, onAccountChange])

  const isLoading = !accounts || accounts.length === 0

  const handleAccountChange = (grantId: string) => {
    // special action: connect new account (redirect)
    if (grantId === "__connect_new__") {
      router.push("/connect")
      return
    }

    setSelectedAccount(grantId)
    // Save selection to localStorage unless it's the placeholder
    if (grantId !== "none") {
      localStorage.setItem("lastSelectedAccount", grantId)
      localStorage.setItem("lastGrantId", grantId)
      if (onAccountChange) onAccountChange(grantId)
    } else {
      localStorage.removeItem("lastSelectedAccount")
    }
  }

  // Only show "Select an account" if no account is selected
  const allAccounts = React.useMemo(() => {
    return [
      ...(selectedAccount === "none"
        ? [
            {
              label: "Select an account",
              email: "",
              grantId: "none",
              icon: (
                <div className="h-6 w-6 rounded-full bg-gray-300 flex items-center justify-center text-xs">?</div>
              ),
            },
          ]
        : []),
      ...accounts,
      // Connect new account option appended to the end
      {
        label: "Connect New Account",
        email: "",
        grantId: "__connect_new__",
        icon: (
          <div className="h-6 w-6 rounded-full bg-accent flex items-center justify-center text-xs text-primary">+</div>
        ),
      },
    ].filter((account) => account.grantId !== "none" || selectedAccount === "none")
  }, [selectedAccount, accounts])

  return (
    <Select 
      defaultValue={selectedAccount} 
      value={selectedAccount}
      onValueChange={handleAccountChange}
    >
      <SelectTrigger
        className={cn(
          "flex items-center gap-2 [&>span]:line-clamp-1 [&>span]:flex [&>span]:w-full [&>span]:items-center [&>span]:gap-1 [&>span]:truncate [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
          isCollapsed &&
            "flex h-9 w-9 shrink-0 items-center justify-center p-0 [&>span]:w-auto [&>svg]:hidden"
        )}
        aria-label="Select account"
      >
        <SelectValue placeholder="Select an account">
          {allAccounts.find((account) => account.grantId === selectedAccount)?.icon}
          <span className={cn("ml-2", isCollapsed && "hidden")}>
            {
              allAccounts.find((account) => account.grantId === selectedAccount)?.label ||
              allAccounts.find((account) => account.grantId === selectedAccount)?.email
            }
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {allAccounts.map((account) => (
          <SelectItem key={account.grantId} value={account.grantId}>
            <div className="flex items-center gap-3 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:text-foreground">
              {account.icon}
              {account.email || account.label}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}