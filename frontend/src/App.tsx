import { useState } from 'react'
import BottomNav from './components/BottomNav.tsx'
import HomePage from './pages/HomePage.tsx'
import WorkoutPage from './pages/WorkoutPage.tsx'
import CatalogPage from './pages/CatalogPage.tsx'
import ProgressPage from './pages/ProgressPage.tsx'
import HistoryPage from './pages/HistoryPage.tsx'
import SettingsPage from './pages/SettingsPage.tsx'
import PlanPage from './pages/PlanPage.tsx'

type Page = 'home' | 'catalog' | 'progress' | 'history' | 'settings' | 'plan'

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  if (activeSessionId) {
    return (
      <WorkoutPage
        sessionId={activeSessionId}
        onComplete={() => setActiveSessionId(null)}
        onBack={() => setActiveSessionId(null)}
      />
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-zinc-950">
      <main className="flex-1 overflow-y-auto">
        {page === 'home'     && (
          <HomePage
            onStartWorkout={id => setActiveSessionId(id)}
            onResumeWorkout={id => setActiveSessionId(id)}
            onNavigatePlan={() => setPage('plan')}
          />
        )}
        {page === 'catalog'  && <CatalogPage />}
        {page === 'progress' && <ProgressPage />}
        {page === 'history'  && <HistoryPage />}
        {page === 'plan'     && <PlanPage />}
        {page === 'settings' && <SettingsPage />}
      </main>

      <BottomNav active={page} onChange={setPage} />
    </div>
  )
}
