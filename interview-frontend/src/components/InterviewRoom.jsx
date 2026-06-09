import { useState, useRef, useEffect, useCallback } from 'react'
import { startSession, sendMessage, speakText } from '../api.js'
import { setCurrentAudio, clearCurrentAudio, stopCurrentAudio } from '../audioManager.js'

function stripMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*]\s+/gm, '• ')
    .replace(/`(.+?)`/g, '$1')
}

const MicIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
  </svg>
)

const STATUS_LABELS = {
  idle: null,
  loading: 'Starting session…',
  ready: 'Hold to speak',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  unlocking: 'Tap to hear opening question',
}

export default function InterviewRoom({ caseType, domain }) {
  const [phase, setPhase] = useState('idle')
  const [messages, setMessages] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState(null)

  const recognitionRef = useRef(null)
  const finalTranscriptRef = useRef('')
  const audioRef = useRef(null)
  const transcriptEndRef = useRef(null)
  const phaseRef = useRef(phase)
  const mountedRef = useRef(true)
  const startGenRef = useRef(0)

  useEffect(() => { phaseRef.current = phase }, [phase])

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, interimText])

  // Auto-start when mounted with a chosen case type
  useEffect(() => {
    handleStart()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // accepts a Blob (pre-fetched) or a string (will fetch)
  const speak = useCallback(async (blobOrText) => {
    try {
      stopCurrentAudio()
      setPhase('speaking')
      const blob = blobOrText instanceof Blob ? blobOrText : await speakText(blobOrText)
      if (!mountedRef.current) return  // navigated away while fetching audio
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      setCurrentAudio(audio)
      audioRef.current = audio
      await new Promise((resolve) => {
        audio.onended = resolve
        audio.onerror = resolve  // fall through on error rather than hang
        audio.play().catch(resolve)
      })
      URL.revokeObjectURL(url)
      clearCurrentAudio()
      audioRef.current = null
    } catch {
      // TTS failed — text is already in transcript, just continue
    } finally {
      if (mountedRef.current) setPhase('ready')
    }
  }, [])

  const pendingAudioRef = useRef(null)

  const handleStart = async () => {
    const myGen = ++startGenRef.current
    const isStale = () => myGen !== startGenRef.current || !mountedRef.current

    setError(null)
    setPhase('loading')
    try {
      const data = await startSession(caseType, domain)
      if (isStale()) return
      setSessionId(data.sessionId)
      setMessages([{ role: 'assistant', text: data.message }])
      // Fetch audio but don't play yet — need a user gesture to unlock autoplay
      try {
        const blob = await speakText(data.message)
        if (isStale()) return
        pendingAudioRef.current = blob
        setPhase('unlocking')
      } catch {
        if (!isStale()) setPhase('ready')
      }
    } catch (err) {
      if (!isStale()) {
        setError('Could not reach the backend. Make sure interview_agent.js is running on port 3001.')
        setPhase('idle')
      }
    }
  }

  const handleUnlock = async () => {
    const blob = pendingAudioRef.current
    pendingAudioRef.current = null
    if (blob) {
      await speak(blob)
    } else {
      setPhase('ready')
    }
  }

  // Stop audio and start recording when user presses the button
  const handlePointerDown = useCallback((e) => {
    e.preventDefault()
    if (phaseRef.current === 'thinking' || phaseRef.current === 'loading') return

    // Interrupt any playing audio
    stopCurrentAudio()
    audioRef.current = null

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setError('Speech recognition is not supported in this browser. Try Chrome or Edge.')
      return
    }

    finalTranscriptRef.current = ''
    setInterimText('')

    const rec = new SpeechRecognition()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'

    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalTranscriptRef.current += e.results[i][0].transcript
        } else {
          interim += e.results[i][0].transcript
        }
      }
      setInterimText(finalTranscriptRef.current + interim)
    }

    rec.onend = async () => {
      const text = finalTranscriptRef.current.trim()
      setInterimText('')

      if (!text) {
        setPhase('ready')
        return
      }

      setMessages((prev) => [...prev, { role: 'user', text }])
      setPhase('thinking')

      try {
        const data = await sendMessage(sessionId, text)
        setMessages((prev) => [...prev, { role: 'assistant', text: data.message }])
        await speak(data.message)
      } catch {
        setError('Failed to send message. Check that the backend is still running.')
        setPhase('ready')
      }
    }

    rec.onerror = (e) => {
      if (e.error !== 'aborted') setError(`Mic error: ${e.error}`)
      setPhase('ready')
    }

    rec.start()
    recognitionRef.current = rec
    setPhase('listening')
  }, [sessionId, speak])

  // Stop recording when pointer released anywhere on the page
  const handleGlobalPointerUp = useCallback(() => {
    if (phaseRef.current === 'listening') {
      recognitionRef.current?.stop()
    }
  }, [])

  useEffect(() => {
    window.addEventListener('pointerup', handleGlobalPointerUp)
    return () => window.removeEventListener('pointerup', handleGlobalPointerUp)
  }, [handleGlobalPointerUp])

  // Stop all audio/recognition when navigating away
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      startGenRef.current++  // invalidate any in-flight handleStart
      stopCurrentAudio()
      recognitionRef.current?.stop()
    }
  }, [])

  const canSpeak = phase === 'ready' || phase === 'speaking' || phase === 'unlocking'
  const isListening = phase === 'listening'

  return (
    <div className="interview-room">
      {/* Transcript */}
      <div className="transcript">
        {messages.length === 0 && (phase === 'idle' || phase === 'loading') && (
          <div className="transcript-empty">
            <p>{phase === 'loading' ? 'Starting your session…' : 'Getting ready…'}</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <span className="message-label">
              {msg.role === 'assistant' ? 'Interviewer' : 'You'}
            </span>
            <p className="message-text">
              {msg.role === 'assistant' ? stripMarkdown(msg.text) : msg.text}
            </p>
          </div>
        ))}

        {interimText && (
          <div className="message user interim">
            <span className="message-label">You</span>
            <p className="message-text">{interimText}</p>
          </div>
        )}

        <div ref={transcriptEndRef} />
      </div>

      {/* Controls */}
      <div className="controls">
        {error && (
          <div className="error-banner">
            {error}
            <button onClick={() => setError(null)} className="error-dismiss">×</button>
          </div>
        )}

        <div className="status-label">
          {STATUS_LABELS[phase]}
        </div>

        {phase === 'unlocking' ? (
          <button className="mic-btn" onClick={handleUnlock} aria-label="Play opening question">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        ) : (
          <button
            className={`mic-btn ${isListening ? 'listening' : ''} ${phase === 'speaking' ? 'speaking' : ''}`}
            onPointerDown={handlePointerDown}
            disabled={phase === 'thinking' || phase === 'loading' || phase === 'idle'}
            aria-label="Hold to speak"
          >
            <MicIcon />
            {isListening && <span className="pulse-ring" />}
          </button>
        )}
      </div>
    </div>
  )
}
