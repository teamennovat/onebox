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

  // Only show "Select to continue" if no account is selected
  const allAccounts = React.useMemo(() => {
    const result = []
    
    // 1. Connect New Account - FIRST
    result.push({
      label: "Connect New Account",
      email: "",
      grantId: "__connect_new__",
      icon: (
        <div className="h-6 w-6 rounded-full bg-accent flex items-center justify-center text-xs text-primary font-bold">+</div>
      ),
    })
    
    // 2. All Accounts option (only if multiple accounts) - SECOND
    if (accounts.length > 1) {
      result.push({
        label: "All Accounts",
        email: "",
        grantId: "__all_accounts__",
        icon: (
          <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center text-xs text-white font-bold">A</div>
        ),
      })
    }
    
    // 3. Individual connected accounts - THIRD (one by one)
    result.push(...accounts)
    
    console.log(`👤 Account Switcher: Displaying ${result.length} options`, result.map(a => ({ label: a.label, grantId: a.grantId })))
    
    return result
  }, [selectedAccount, accounts])

  // Placeholder option (shown only when nothing selected, not in dropdown)
  const placeholderOption = {
    label: "Select to continue",
    email: "",
    grantId: "none",
    icon: (
      <div className="h-6 w-6 rounded-full bg-gray-300 flex items-center justify-center text-xs">?</div>
    ),
  }

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
        <SelectValue placeholder="Select to continue">
          {selectedAccount === "none" ? (
            // Show placeholder when nothing selected
            <>
              {placeholderOption.icon}
              <span className={cn("ml-2", isCollapsed && "hidden")}>
                {placeholderOption.label}
              </span>
            </>
          ) : (
            // Show selected account
            <>
              {allAccounts.find((account) => account.grantId === selectedAccount)?.icon}
              <span className={cn("ml-2", isCollapsed && "hidden")}>
                {
                  allAccounts.find((account) => account.grantId === selectedAccount)?.label ||
                  allAccounts.find((account) => account.grantId === selectedAccount)?.email
                }
              </span>
            </>
          )}
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