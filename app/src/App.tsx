import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Loading } from './components/ui'
import { AppProvider, useApp } from './lib/auth'
import { I18nProvider } from './lib/i18n'
import { isConfigured } from './lib/supabase'
import { Check } from './pages/Check'
import { Dashboard } from './pages/Dashboard'
import { FoodHome } from './pages/food/FoodHome'
import { FoodManual } from './pages/food/FoodManual'
import { FoodSnap } from './pages/food/FoodSnap'
import { HealthSync } from './pages/HealthSync'
import { Install } from './pages/Install'
import { Infographic } from './pages/learn/Infographic'
import { LearnHome } from './pages/learn/LearnHome'
import { Login } from './pages/Login'
import { Onboarding } from './pages/Onboarding'
import { Photos } from './pages/Photos'
import { Settings } from './pages/Settings'
import { ActiveWorkout } from './pages/train/ActiveWorkout'
import { ExerciseDetail } from './pages/train/ExerciseDetail'
import { History } from './pages/train/History'
import { SessionDetail } from './pages/train/SessionDetail'
import { TrainHome } from './pages/train/TrainHome'
import { WorkoutEditor } from './pages/train/WorkoutEditor'
import { Weights } from './pages/Weights'

function Gate() {
  const { session, profile, loading } = useApp()
  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-md p-6">
        <h1 className="mb-2 text-2xl font-bold">Forza!</h1>
        <p>
          Missing configuration: set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_KEY</code> (see README).
        </p>
      </div>
    )
  }
  if (loading) return <Loading />
  if (!session) return <Login />
  if (!profile?.onboarded_at) return <Onboarding />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="train" element={<TrainHome />} />
        <Route path="train/new" element={<WorkoutEditor />} />
        <Route path="train/edit/:id" element={<WorkoutEditor />} />
        <Route path="train/history" element={<History />} />
        <Route path="train/session/:id" element={<SessionDetail />} />
        <Route path="exercise/:id" element={<ExerciseDetail />} />
        <Route path="check" element={<Check />} />
        <Route path="check/photos" element={<Photos />} />
        <Route path="food" element={<FoodHome />} />
        <Route path="food/snap" element={<FoodSnap />} />
        <Route path="food/add" element={<FoodManual />} />
        <Route path="learn" element={<LearnHome />} />
        <Route path="learn/:id" element={<Infographic />} />
        <Route path="weights" element={<Weights />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/health" element={<HealthSync />} />
        <Route path="settings/install" element={<Install />} />
      </Route>
      {/* The active workout is full screen: no tab bar to tap by mistake. */}
      <Route path="train/active" element={<ActiveWorkout />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <AppProvider>
        <HashRouter>
          <Gate />
        </HashRouter>
      </AppProvider>
    </I18nProvider>
  )
}
