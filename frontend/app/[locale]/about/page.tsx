import type { Metadata } from "next"
import AboutClient from "./AboutClient"

export const metadata: Metadata = {
  title: "About Us | United Services Egypt",
  description:
    "Founded in 2005, United Services Egypt operates a 6,000 m² integrated manufacturing and application facility in Cairo, certified to API Q1, ISO 9001, ISO 14001, and ISO 45001.",
}

export default function AboutPage() {
  return <AboutClient />
}
