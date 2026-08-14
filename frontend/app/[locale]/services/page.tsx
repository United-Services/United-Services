import type { Metadata } from "next"
import ServicesClient from "./ServicesClient"

export const metadata: Metadata = {
  title: "Services | United Services Egypt",
  description:
    "GRE tubular lining, external wrapping, industrial coating, HDPE lining, RTP systems, and RTV insulator coating — six certified corrosion-control systems engineered at our Cairo facility.",
}

export default function ServicesPage() {
  return <ServicesClient />
}
