import { useState } from 'react'
import ScoresTab from './ScoresTab.jsx'
import SessionsTab from './SessionsTab.jsx'
import ResumeTab from './ResumeTab.jsx'

const TABS = [
  { id: 'scores', label: 'Scores' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'resume', label: 'Resume' },
]

export default function ProgressView() {
  const [tab, setTab] = useState('scores')

  return (
    <div className="progress-panel">
      <div className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="tab-content">
        {tab === 'scores' && <ScoresTab />}
        {tab === 'sessions' && <SessionsTab />}
        {tab === 'resume' && <ResumeTab />}
      </div>
    </div>
  )
}
