import { Suspense, lazy, useEffect } from 'react'

const OldApp = lazy(() => import('./OldApp.jsx'))

const isRecordMode = () => {
  try {
    const params = new URLSearchParams(window.location.search || '')
    const raw = String(params.get('record') || '').trim().toLowerCase()
    return raw === '1' || raw === 'true' || raw === 'yes'
  } catch {
    return false
  }
}

function App() {
  useEffect(() => {
    const enabled = isRecordMode()
    const root = document.documentElement
    const body = document.body
    if (enabled) {
      root.classList.add('rm-record')
      body?.classList?.add('rm-record')
    } else {
      root.classList.remove('rm-record')
      body?.classList?.remove('rm-record')
    }
    return () => {
      root.classList.remove('rm-record')
      body?.classList?.remove('rm-record')
    }
  }, [])

  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050816]" />}>
      <OldApp />
    </Suspense>
  )
}

export default App
