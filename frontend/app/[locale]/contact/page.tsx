import type { Metadata } from "next"
import ContactClient from "./ContactClient"

export const metadata: Metadata = {
  title: "Contact | United Services Egypt",
  description:
    "Speak with a USE engineer about your application. 14S Building, El Oroba Street Extension, New Maadi, Cairo. Tel: (+2) 0227033656.",
}

export default function ContactPage() {
  return <ContactClient />
}
