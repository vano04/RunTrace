import type { Metadata } from "next"

import { AccessAdmin } from "@/components/access-admin"

export const metadata: Metadata = { title: "Access" }

export default function AccessPage() {
  return <AccessAdmin />
}
