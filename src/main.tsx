import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'

const Root =
  import.meta.env.DEV && new URLSearchParams(location.search).get('demo') === 'reading' ? lazy(() => import('./ui/reading/ReadingDemo')) : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense>
      <Root />
    </Suspense>
  </StrictMode>,
)
