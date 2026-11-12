import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'

const demo = import.meta.env.DEV ? new URLSearchParams(location.search).get('demo') : null
const Root =
  demo === 'reading' ? lazy(() => import('./ui/reading/ReadingDemo')) : demo === 'evidence' ? lazy(() => import('./ui/interaction/EvidenceDemo')) : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense>
      <Root />
    </Suspense>
  </StrictMode>,
)
