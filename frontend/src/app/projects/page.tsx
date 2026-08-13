import type { Metadata } from 'next'
import ProjectsClient from './ProjectsClient'

export const metadata: Metadata = {
  title: 'Projects | United Services Egypt',
  description: 'Pipeline integrity and corrosion-control work delivered for ADNOC, BP, Shell, ENI, Petrobel, and other operators across Egypt and the region.',
}

export default function ProjectsPage() {
  return <ProjectsClient />
}
