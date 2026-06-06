const BASE = 'http://localhost:3001'

export async function startSession(caseType, domain) {
  const res = await fetch(`${BASE}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseType, domain }),
  })
  if (!res.ok) throw new Error(`Start failed: ${res.status}`)
  return res.json()
}

export async function sendMessage(sessionId, message) {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message }),
  })
  if (!res.ok) throw new Error(`Chat failed: ${res.status}`)
  return res.json()
}

export async function getProgress() {
  const res = await fetch(`${BASE}/progress`)
  if (!res.ok) throw new Error(`Progress failed: ${res.status}`)
  return res.json()
}

export async function speakText(text) {
  const res = await fetch(`${BASE}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error(`TTS failed: ${res.status}`)
  return res.blob()
}
