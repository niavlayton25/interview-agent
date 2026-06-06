import { useState, useEffect, useRef } from 'react'
import { getResume, uploadResume, deleteResume } from '../api.js'

export default function ResumeTab() {
  const [content, setContent] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [mode, setMode] = useState(null) // null | 'paste' | 'uploading'
  const [pasteText, setPasteText] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    getResume()
      .then((r) => { setContent(r.content); setUpdatedAt(r.updated_at) })
      .catch(() => setError('Could not load resume.'))
      .finally(() => setLoading(false))
  }, [])

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setMode('uploading')
    setSaving(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      await uploadResume(form)
      const r = await getResume()
      setContent(r.content)
      setUpdatedAt(r.updated_at)
      setMode(null)
    } catch {
      setError('Upload failed. Make sure it\'s a PDF.')
    } finally {
      setSaving(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handlePasteSave() {
    if (!pasteText.trim()) return
    setSaving(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('text', pasteText.trim())
      await uploadResume(form)
      const r = await getResume()
      setContent(r.content)
      setUpdatedAt(r.updated_at)
      setMode(null)
      setPasteText('')
    } catch {
      setError('Could not save resume text.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await deleteResume()
      setContent(null)
      setUpdatedAt(null)
      setMode(null)
    } catch {
      setError('Could not delete resume.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="tab-state">Loading…</div>

  return (
    <div className="resume-tab">
      <div className="resume-header">
        <div>
          <h3 className="resume-title">Resume</h3>
          <p className="resume-subtitle">
            When uploaded, the agent references your background in behavioral and elevator pitch questions.
          </p>
        </div>
      </div>

      {error && (
        <div className="resume-error">
          {error}
          <button onClick={() => setError(null)} className="error-dismiss">×</button>
        </div>
      )}

      {content ? (
        <div className="resume-present">
          <div className="resume-meta">
            <span className="resume-status-dot" />
            <span className="resume-status-text">Resume loaded</span>
            {updatedAt && <span className="resume-date">· Updated {new Date(updatedAt).toLocaleDateString()}</span>}
          </div>
          <div className="resume-preview">
            {content.slice(0, 500)}{content.length > 500 ? '…' : ''}
          </div>
          <div className="resume-actions">
            <button className="resume-replace-btn" onClick={() => fileRef.current?.click()} disabled={saving}>
              Replace PDF
            </button>
            <button className="resume-paste-btn" onClick={() => { setMode('paste'); setPasteText(content) }} disabled={saving}>
              Edit text
            </button>
            <button className="resume-delete-btn" onClick={handleDelete} disabled={saving}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="resume-empty">
          {mode === 'paste' ? null : (
            <div className="resume-upload-options">
              <button className="upload-option-btn primary" onClick={() => fileRef.current?.click()} disabled={saving}>
                Upload PDF
              </button>
              <button className="upload-option-btn" onClick={() => setMode('paste')} disabled={saving}>
                Paste text
              </button>
            </div>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept=".pdf"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Paste mode */}
      {mode === 'paste' && (
        <div className="paste-mode">
          <textarea
            className="resume-textarea"
            placeholder="Paste your resume text here…"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={12}
          />
          <div className="paste-actions">
            <button className="start-btn" onClick={handlePasteSave} disabled={saving || !pasteText.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="coach-decide-btn" onClick={() => { setMode(null); setPasteText('') }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'uploading' && saving && (
        <div className="tab-state">Parsing PDF…</div>
      )}
    </div>
  )
}
