import { useState, useEffect } from 'react'
import { getSessions, getSession } from '../api.js'

const TYPE_LABELS = {
  product_sense: 'Product Sense',
  product_strategy: 'Product Strategy',
  product_execution: 'Execution & Analytics',
  technical: 'Technical',
  behavioral: 'Behavioral',
  elevator_pitch: 'Elevator Pitch',
  favorite_product: 'Favorite Product',
}

const DOMAIN_LABELS = { pinterest: 'Pinterest', big_tech: 'Big Tech' }

const SCORE_COLORS = {
  product_sense: '#4f6ef7', product_strategy: '#a855f7', product_execution: '#22c55e',
  technical: '#f59e0b', behavioral: '#ec4899', elevator_pitch: '#14b8a6', favorite_product: '#f97316',
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function ScoreBar({ label, value, color }) {
  return (
    <div className="rubric-row">
      <span className="rubric-label">{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${(value / 5) * 100}%`, background: color }} />
      </div>
      <span className="rubric-val">{Number(value).toFixed(1)}</span>
    </div>
  )
}

function SessionDetail({ sessionId, onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSession(sessionId).then(setData).finally(() => setLoading(false))
  }, [sessionId])

  if (loading) return <div className="tab-state">Loading session…</div>
  if (!data) return <div className="tab-state error">Session not found.</div>

  const { session, messages, answers } = data
  const color = SCORE_COLORS[session.case_type] || '#4f6ef7'

  return (
    <div className="session-detail">
      <button className="back-link" onClick={onBack}>← Sessions</button>

      <div className="session-detail-header">
        <div className="session-detail-meta">
          <span className="type-pill" style={{ borderColor: color }}>{TYPE_LABELS[session.case_type] || "Coach's Choice"}</span>
          {session.domain && <span className="domain-tag">{DOMAIN_LABELS[session.domain] || session.domain}</span>}
        </div>
        <span className="session-detail-date">{formatDate(session.started_at)}</span>
      </div>

      {answers.length > 0 && (
        <div className="rubric-section">
          <h3 className="section-title">Rubric</h3>
          {answers.map((a, i) => (
            <div key={i} className="rubric-card">
              {answers.length > 1 && <p className="rubric-question">Q{i + 1}: {a.question}</p>}
              <div className="rubric-bars">
                <ScoreBar label="Structure" value={a.score_structure} color={color} />
                <ScoreBar label="Insight" value={a.score_insight} color={color} />
                <ScoreBar label="Communication" value={a.score_communication} color={color} />
              </div>
              <div className="rubric-avg">Avg: {Number(a.avg_score).toFixed(1)}/5</div>
              {a.feedback && <p className="rubric-feedback">{a.feedback}</p>}
            </div>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div className="transcript-section">
          <h3 className="section-title">Transcript</h3>
          <div className="transcript-log">
            {messages.map((m, i) => (
              <div key={i} className={`log-message ${m.role}`}>
                <span className="log-label">{m.role === 'assistant' ? 'Interviewer' : 'You'}</span>
                <p className="log-text">{m.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {messages.length === 0 && answers.length === 0 && (
        <div className="tab-state"><p className="muted">No transcript recorded for this session.</p></div>
      )}
    </div>
  )
}

export default function SessionsTab() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    getSessions().then(setSessions).finally(() => setLoading(false))
  }, [])

  if (selected) {
    return <SessionDetail sessionId={selected} onBack={() => setSelected(null)} />
  }

  if (loading) return <div className="tab-state">Loading sessions…</div>

  if (sessions.length === 0) {
    return (
      <div className="tab-state">
        <p className="muted">No sessions yet.</p>
        <p className="muted" style={{ marginTop: '0.5rem' }}>Your interview history will appear here.</p>
      </div>
    )
  }

  return (
    <div className="sessions-list">
      {sessions.map((s) => (
        <button key={s.id} className="session-row" onClick={() => setSelected(s.id)}>
          <div className="session-row-main">
            <span className="session-type">{TYPE_LABELS[s.case_type] || "Coach's Choice"}</span>
            {s.domain && <span className="session-domain-tag">{DOMAIN_LABELS[s.domain]}</span>}
          </div>
          <div className="session-row-meta">
            <span className="session-date">{formatDate(s.started_at)}</span>
            <div className="session-row-right">
              {s.question_count > 0 && <span className="session-q-count">{s.question_count}Q</span>}
              {s.avg_score && <span className="session-avg">{Number(s.avg_score).toFixed(1)}/5</span>}
              <span className="session-chevron">›</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}
