import { useState, useEffect } from 'react'
import { getProgress } from '../api.js'

const CASE_TYPES = ['product_sense', 'product_strategy', 'product_execution', 'technical', 'behavioral', 'elevator_pitch', 'favorite_product']

const SCORE_COLORS = {
  product_sense: '#4f6ef7',
  product_strategy: '#a855f7',
  product_execution: '#22c55e',
  technical: '#f59e0b',
  behavioral: '#ec4899',
  elevator_pitch: '#14b8a6',
  favorite_product: '#f97316',
}

const TYPE_LABELS = {
  product_sense: 'Product Sense',
  product_strategy: 'Product Strategy',
  product_execution: 'Execution & Analytics',
  technical: 'Technical',
  behavioral: 'Behavioral',
  elevator_pitch: 'Elevator Pitch',
  favorite_product: 'Favorite Product',
}

export default function ScoresTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getProgress()
      .then(setData)
      .catch(() => setError('Could not load scores. Make sure the backend is running.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="tab-state">Loading…</div>
  if (error) return <div className="tab-state error">{error}</div>
  if (data?.summary) return (
    <div className="tab-state">
      <p className="muted">{data.summary}</p>
      <p className="muted" style={{ marginTop: '0.5rem' }}>Complete a session to see scores here.</p>
    </div>
  )

  const activeCaseTypes = CASE_TYPES.filter((t) => data.by_type?.[t])

  return (
    <div className="scores-tab">
      <div className="overall-card">
        <div className="overall-score">{data.overall_avg}<span>/5</span></div>
        <div className="overall-label">Overall Average</div>
        <div className="session-count">{data.total_sessions} question{data.total_sessions !== 1 ? 's' : ''} answered</div>
      </div>

      <div className="score-grid">
        {activeCaseTypes.map((type) => {
          const score = parseFloat(data.by_type[type])
          return (
            <div key={type} className="score-card">
              <div className="score-card-header">
                <span className="type-name">{TYPE_LABELS[type]}</span>
                <span className="type-score">{data.by_type[type]}/5</span>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(score / 5) * 100}%`, background: SCORE_COLORS[type] }} />
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
                  <span className="type-pill" style={{ borderColor: SCORE_COLORS[r.type] }}>{TYPE_LABELS[r.type] || r.type}</span>
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
