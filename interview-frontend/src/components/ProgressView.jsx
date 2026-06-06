import { useState, useEffect } from 'react'
import { getProgress } from '../api.js'

const CASE_TYPES = ['design', 'metrics', 'estimation', 'strategy']

const SCORE_COLORS = {
  design: '#4f6ef7',
  metrics: '#a855f7',
  estimation: '#22c55e',
  strategy: '#f59e0b',
}

export default function ProgressView() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getProgress()
      .then(setData)
      .catch(() => setError('Could not load progress. Make sure the backend is running.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="progress-state">Loading your progress…</div>
  }

  if (error) {
    return <div className="progress-state error">{error}</div>
  }

  // No sessions yet
  if (data?.summary) {
    return (
      <div className="progress-state">
        <p className="muted">{data.summary}</p>
        <p className="muted" style={{ marginTop: '0.5rem' }}>Complete your first session to see scores here.</p>
      </div>
    )
  }

  const activeCaseTypes = CASE_TYPES.filter((t) => data.by_type?.[t])

  return (
    <div className="progress-view">
      <div className="overall-card">
        <div className="overall-score">{data.overall_avg}<span>/5</span></div>
        <div className="overall-label">Overall Average</div>
        <div className="session-count">{data.total_sessions} session{data.total_sessions !== 1 ? 's' : ''}</div>
      </div>

      <div className="score-grid">
        {activeCaseTypes.map((type) => {
          const score = parseFloat(data.by_type[type])
          const pct = (score / 5) * 100
          return (
            <div key={type} className="score-card">
              <div className="score-card-header">
                <span className="type-name">{type}</span>
                <span className="type-score">{data.by_type[type]}/5</span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${pct}%`, background: SCORE_COLORS[type] }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {data.recent?.length > 0 && (
        <div className="recent-section">
          <h3 className="section-title">Recent Feedback</h3>
          <div className="feedback-list">
            {data.recent.map((r, i) => (
              <div key={i} className="feedback-item">
                <div className="feedback-header">
                  <span className="type-pill" style={{ borderColor: SCORE_COLORS[r.type] }}>
                    {r.type}
                  </span>
                  <span className="feedback-score">{r.avg}/5</span>
                </div>
                <p className="feedback-text">{r.feedback}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
