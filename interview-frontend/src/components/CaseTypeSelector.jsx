import { useState } from 'react'

const DOMAIN_FILTERS = [
  { id: null, label: 'Any domain' },
  { id: 'pinterest', label: 'Pinterest' },
  { id: 'big_tech', label: 'Big Tech' },
]

const CASE_TYPES = [
  {
    id: 'product_sense',
    label: 'Product Sense',
    description: 'Design or improve a product for a given user and market',
    color: '#4f6ef7',
  },
  {
    id: 'product_strategy',
    label: 'Product Strategy',
    description: 'Market entry, competitive positioning, roadmap decisions',
    color: '#a855f7',
  },
  {
    id: 'product_execution',
    label: 'Execution & Analytics',
    description: 'Diagnose metric drops, design experiments, measure success',
    color: '#22c55e',
  },
  {
    id: 'technical',
    label: 'Technical',
    description: 'System design and technical tradeoffs for a PM role',
    color: '#f59e0b',
  },
  {
    id: 'behavioral',
    label: 'Behavioral',
    description: 'Tell me about a time when... (STAR format)',
    color: '#ec4899',
  },
  {
    id: 'elevator_pitch',
    label: 'Elevator Pitch',
    description: 'Tell me about yourself — your 2-minute personal pitch for any interview',
    color: '#14b8a6',
  },
  {
    id: 'favorite_product',
    label: 'Favorite Product',
    description: 'What\'s your favorite product? Least favorite? How would you improve it?',
    color: '#f97316',
  },
]

export default function CaseTypeSelector({ onStart }) {
  const [selected, setSelected] = useState(null)
  const [domain, setDomain] = useState(null)

  return (
    <div className="selector-view">
      <div className="selector-header">
        <h2 className="selector-title">What would you like to practice?</h2>
        <p className="selector-subtitle">Pick a type and get a question tailored to it</p>
      </div>

      <div className="case-grid">
        {CASE_TYPES.map((type) => (
          <button
            key={type.id}
            className={`case-card ${selected === type.id ? 'selected' : ''}`}
            style={{ '--card-color': type.color }}
            onClick={() => setSelected(type.id)}
          >
            <div className="card-dot" />
            <span className="card-label">{type.label}</span>
            <span className="card-desc">{type.description}</span>
          </button>
        ))}
      </div>

      <div className="domain-filter">
        <span className="domain-filter-label">Company focus</span>
        <div className="domain-pills">
          {DOMAIN_FILTERS.map((f) => (
            <button
              key={String(f.id)}
              className={`domain-pill ${domain === f.id ? 'active' : ''}`}
              onClick={() => setDomain(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="selector-actions">
        <button
          className="start-btn"
          disabled={!selected}
          onClick={() => onStart(selected, domain)}
        >
          Start Session
        </button>
        <button
          className="coach-decide-btn"
          onClick={() => onStart(null, domain)}
        >
          Let the coach decide
        </button>
      </div>
    </div>
  )
}
