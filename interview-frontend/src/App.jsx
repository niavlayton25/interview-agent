import { useState } from 'react'
import CaseTypeSelector from './components/CaseTypeSelector.jsx'
import InterviewRoom from './components/InterviewRoom.jsx'
import ProgressView from './components/ProgressView.jsx'

export default function App() {
  const [view, setView] = useState('selector') // selector | interview | progress
  const [caseType, setCaseType] = useState(null)

  const [domain, setDomain] = useState(null)

  function handleStart(type, domainContext) {
    setCaseType(type)
    setDomain(domainContext)
    setView('interview')
  }

  function handleBack() {
    setView('selector')
    setCaseType(null)
  }

  return (
    <div className="app">
      <header className="app-header">
        <button
          className="logo-btn"
          onClick={view !== 'progress' ? handleBack : undefined}
          style={{ cursor: view !== 'selector' && view !== 'progress' ? 'pointer' : 'default' }}
        >
          PM Interview Coach
        </button>
        <button
          className={`nav-btn ${view === 'progress' ? 'active' : ''}`}
          onClick={() => setView(view === 'progress' ? (caseType ? 'interview' : 'selector') : 'progress')}
        >
          {view === 'progress' ? '← Back' : 'Progress'}
        </button>
      </header>

      <main className="app-main">
        {view === 'selector' && <CaseTypeSelector onStart={handleStart} />}
        {view === 'interview' && <InterviewRoom caseType={caseType} domain={domain} onBack={handleBack} />}
        {view === 'progress' && <ProgressView />}
      </main>
    </div>
  )
}
