import type { Metadata } from "next"
import AccountDisabledClient from "./AccountDisabledClient"

export const metadata: Metadata = {
  title: "Account Disabled | United Services Egypt",
}

export default function AccountDisabledPage() {
  return <AccountDisabledClient />
}
