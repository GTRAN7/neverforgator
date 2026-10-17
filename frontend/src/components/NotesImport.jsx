import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { resizeForUpload } from '../lib/resizeImage.js';

// Other ways to get notes into the box besides typing:
//   📷 a photo of handwritten notes, slides or a textbook page, or a PDF → Gemini reads it
//   🎙 talk: live speech-to-text in the browser (free, words appear as you speak);
//      browsers without it record audio and Gemini transcribes it
//   🎧 an audio file (a voice memo, a lecture clip) → Gemini transcribes it
// Every file import counts toward the daily scan limit; live talking doesn't.
const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

export default function NotesImport({ onText, scansLeft, onUsed }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const recognition = useRef(null);
  const recorder = useRef(null);
  const photoInput = useRef(null);
  const audioInput = useRef(null);

  useEffect(() => () => {
    recognition.current?.abort();
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  async function importFile(blob, name, what) {
    setError('');
    setBusy(what);
    try {
      const { text } = await api.importNotes(blob, name);
      if (text.trim()) onText(text.trim());
      else setError('Couldn’t find anything to study in that. Try a clearer photo or recording.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
      onUsed();
    }
  }

  async function onPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    // Phone photos are huge; Gemini reads a 2400 px version just as well and it uploads 10× faster.
    const shrinkable = /^image\/(jpeg|png|webp)$/.test(file.type);
    const blob = shrinkable ? await resizeForUpload(file, 2400) : file;
    importFile(blob, shrinkable ? 'notes.jpg' : file.name, 'Reading your notes…');
  }

  function onAudio(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) importFile(file, file.name, 'Transcribing your recording…');
  }

  // Live talking with the browser's speech recognition.
  function startListening() {
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';
    rec.onresult = (event) => {
      let live = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) onText(result[0].transcript.trim(), { inline: true });
        else live += result[0].transcript;
      }
      setInterim(live);
    };
    rec.onerror = (event) => {
      if (event.error === 'not-allowed') setError('Allow the microphone to talk your notes in.');
      else if (event.error !== 'no-speech' && event.error !== 'aborted') setError(`Microphone: ${event.error}`);
    };
    rec.onend = () => { setListening(false); setInterim(''); };
    rec.start();
    recognition.current = rec;
    setError('');
    setListening(true);
  }

  // No live recognition (e.g. Firefox): record, then let Gemini transcribe.
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = rec.mimeType.split(';')[0] || 'audio/webm';
        importFile(new Blob(chunks, { type }), `talk.${type.split('/')[1]}`, 'Transcribing what you said…');
      };
      rec.start();
      recorder.current = rec;
      setError('');
      setListening(true);
    } catch {
      setError('Allow the microphone to talk your notes in.');
    }
  }

  function toggleTalk() {
    if (listening) {
      recognition.current?.stop();
      if (recorder.current?.state === 'recording') recorder.current.stop();
      setListening(false);
      return;
    }
    if (SpeechRecognition) startListening();
    else startRecording();
  }

  const outOfScans = scansLeft !== null && scansLeft <= 0;
  return (
    <div className="notes-import">
      <div className="import-row">
        <button type="button" className={`import-btn ${listening ? 'live' : ''}`} onClick={toggleTalk} disabled={Boolean(busy)}
          title="Talk about what you need to remember">
          <span aria-hidden="true">{listening ? '■' : '🎙'}</span> {listening ? 'Stop talking' : 'Talk it in'}
        </button>
        <button type="button" className="import-btn" disabled={Boolean(busy) || listening || outOfScans}
          onClick={() => photoInput.current.click()} title="A photo of notes, slides or a textbook page, or a PDF">
          <span aria-hidden="true">📷</span> Photo or PDF
        </button>
        <button type="button" className="import-btn" disabled={Boolean(busy) || listening || outOfScans}
          onClick={() => audioInput.current.click()} title="A voice memo or lecture clip">
          <span aria-hidden="true">🎧</span> Audio file
        </button>
        <input ref={photoInput} type="file" hidden accept="image/*,application/pdf" onChange={onPhoto} />
        <input ref={audioInput} type="file" hidden accept="audio/*,.m4a,.mp3,.wav" onChange={onAudio} />
      </div>
      {listening && (
        <p className="live-note">
          <span className="rec-dot" /> Listening… explain it like you’re teaching a friend.
          {interim && <em> “{interim}”</em>}
        </p>
      )}
      {busy && <p className="live-note pulse">{busy}</p>}
      {error && <p className="error-text">{error}</p>}
      {scansLeft !== null && (
        <span className="hint-text">{outOfScans ? 'No photo/audio scans left today (talking still works).' : `${scansLeft} photo/audio scans left today`}</span>
      )}
    </div>
  );
}
