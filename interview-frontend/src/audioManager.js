let _audio = null

export function setCurrentAudio(audio) { _audio = audio }
export function clearCurrentAudio() { _audio = null }
export function stopCurrentAudio() {
  if (_audio) {
    _audio.pause()
    _audio = null
  }
}
