import { useState } from 'react'
import Home from './pages/Home'
import About from './pages/About'
import Vision from './pages/Vision'
import Services from './pages/Services'
import Projects from './pages/Projects'
import Contact from './pages/Contact'
import Careers from './pages/Careers'
import ClientLogin from './pages/ClientLogin'
import ClientSignup from './pages/ClientSignup'
import ResetPassword1 from './pages/ResetPassword1'
import ResetPassword2 from './pages/ResetPassword2'
import ClientDashboard from './pages/ClientDashboard'
import CandidateSignup from './pages/CandidateSignup'
import AdminLogin from './pages/AdminLogin'
import AdminDashboard from './pages/AdminDashboard'

type Page =
  | 'home' | 'about' | 'vision' | 'services' | 'projects' | 'contact' | 'careers'
  | 'client-login' | 'client-signup' | 'reset1' | 'reset2'
  | 'client-dashboard'
  | 'candidate-signup'
  | 'admin-login' | 'admin-dashboard'

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [projectCompany, setProjectCompany] = useState<string | null>(null)

  const navigate = (p: string, param?: string) => {
    if (p === 'projects') setProjectCompany(param ?? null)
    setPage(p as Page)
  }

  switch (page) {
    case 'home':          return <Home onNavigate={navigate} />
    case 'about':         return <About onNavigate={navigate} />
    case 'vision':        return <Vision onNavigate={navigate} />
    case 'services':      return <Services onNavigate={navigate} />
    case 'projects':      return <Projects onNavigate={navigate} company={projectCompany} />
    case 'contact':       return <Contact onNavigate={navigate} />
    case 'careers':       return <Careers onNavigate={navigate} />
    case 'client-login':  return <ClientLogin onNavigate={navigate} onLogin={() => navigate('client-dashboard')} />
    case 'client-signup': return <ClientSignup onNavigate={navigate} onSignup={() => navigate('client-login')} />
    case 'reset1':        return <ResetPassword1 onNavigate={navigate} onNext={() => navigate('reset2')} />
    case 'reset2':        return <ResetPassword2 onNavigate={navigate} />
    case 'client-dashboard': return <ClientDashboard onNavigate={navigate} onLogout={() => navigate('home')} />
    case 'candidate-signup': return <CandidateSignup onNavigate={navigate} />
    case 'admin-login':   return <AdminLogin onNavigate={navigate} onLogin={() => navigate('admin-dashboard')} />
    case 'admin-dashboard': return <AdminDashboard onNavigate={navigate} onLogout={() => navigate('home')} />
    default:              return <Home onNavigate={navigate} />
  }
}
