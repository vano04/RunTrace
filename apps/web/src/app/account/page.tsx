import type { Metadata } from "next"

import { AccountSettings } from "@/components/account-settings"

export const metadata: Metadata = { title: "Settings" }

export default function AccountPage() {
  return <AccountSettings />
}
