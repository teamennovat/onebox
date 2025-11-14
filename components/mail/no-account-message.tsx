import * as React from "react"

export function NoAccountMessage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
      <div className="text-lg font-semibold mb-2">Select an account to see emails</div>
      <div className="text-sm">Choose an email account from the account switcher above</div>
    </div>
  )
}