import { useEffect, useRef, useState } from 'react';
import './journal-voice.css';
import { pairingCode } from '../sync/client.js';
import { loadVoice, maxVoiceBytes, saveVoice, validClip } from '../sync/voice.js';

const maxSeconds = 45;
const speechBridge = () => window.webkit?.messageHandlers?.journalSpeech;
const speechBrowser = () => window.SpeechRecognition || window.webkitSpeechRecognition;
const recordingOK = () => Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
const voiceLocale = () => navigator.language || 'en-IN';
const supportedTypes = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus'];
const speechError = 'Dictation couldn’t recognize speech. Try again, or use your keyboard’s dictation in the editor.';
const asDataURL = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

function stopSession(session, discard = false) {
  session.discard ||= discard;
  clearTimeout(session.timer);
  clearTimeout(session.finishTimer);
  try { if (session.recorder?.state === 'recording') session.recorder.stop(); } catch { /* already stopped */ }
  session.stream?.getTracks().forEach(track => track.stop());
  try { if (discard) session.recognizer?.abort(); else session.recognizer?.stop(); } catch { /* already stopped */ }
}

export default function JournalVoice({ clips, onInsert, onAttach, onRemove }) {
  const session = useRef(null);
  const transfers = useRef(new AbortController());
  const urls = useRef(new Set());
  const active = useRef(true);
  const [mode, setMode] = useState('');
  const [phase, setPhase] = useState('');
  const [transcript, setTranscript] = useState('');
  const [audio, setAudio] = useState(null);
  const [preview, setPreview] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [player, setPlayer] = useState(null);
  const [loadingClip, setLoadingClip] = useState(null);
  useEffect(() => {
    active.current = true;
    transfers.current = new AbortController();
    const finish = () => {
      if (session.current?.finish) session.current.finish(session.current.speechFinished);
      else if (session.current) stopSession(session.current, true);
      document.querySelectorAll('.j-voice audio').forEach(element => element.pause());
    };
    const onHidden = () => { if (document.hidden) finish(); };
    window.addEventListener('journal:inactive', finish);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      active.current = false;
      if (session.current) stopSession(session.current, true);
      session.current = null;
      transfers.current.abort();
      urls.current.forEach(url => URL.revokeObjectURL(url));
      urls.current.clear();
      window.removeEventListener('journal:inactive', finish);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, []);
  useEffect(() => {
    if (!audio) { setPreview(''); return; }
    const url = URL.createObjectURL(audio.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [audio]);

  const start = async value => {
    if (session.current || busy) return;
    const wantsText = value !== 'audio';
    const keepAudio = value !== 'text';
    const native = wantsText && speechBridge();
    const Speech = wantsText && !native && speechBrowser();
    if (wantsText && !native && !Speech) { setStatus(speechError); return; }
    if (keepAudio && !pairingCode()) { setStatus('Pair your private workspace in Settings to save voice clips.'); return; }
    if ((keepAudio || native) && !recordingOK()) { setStatus('Microphone recording isn’t available here. Try Safari or Chrome.'); return; }
    const capture = { parts: [], final: '', interim: '', discard: false };
    session.current = capture;
    setMode(value); setPhase('starting'); setTranscript(''); setAudio(null); setStatus('Waiting for microphone…');
    const current = () => active.current && session.current === capture && !capture.discard;
    try {
      let recorded;
      if (keepAudio || native) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!current()) { stream.getTracks().forEach(track => track.stop()); throw new Error('Microphone request ended.'); }
        capture.stream = stream;
        const mimeType = supportedTypes.find(type => window.MediaRecorder.isTypeSupported(type));
        const recorder = new window.MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 });
        capture.recorder = recorder;
        recorded = new Promise(resolve => {
          recorder.ondataavailable = event => { if (event.data.size) capture.parts.push(event.data); };
          recorder.onstop = () => resolve(new Blob(capture.parts, { type: recorder.mimeType || capture.parts[0]?.type }));
          recorder.onerror = () => { resolve(null); capture.finish?.(); };
        });
        recorder.start();
      }
      const started = window.performance.now();
      capture.finish = async (speechEnded = false) => {
        if (!current() || capture.finishing) return;
        capture.finishing = true;
        clearTimeout(capture.timer);
        const seconds = Math.max(1, Math.min(maxSeconds, Math.round((window.performance.now() - started) / 1000)));
        if (capture.recorder?.state === 'recording') capture.recorder.stop();
        capture.stream?.getTracks().forEach(track => track.stop());
        setPhase('finishing'); setStatus(native ? 'Turning speech into text…' : 'Finishing…');
        if (!speechEnded && capture.recognizer) {
          const ended = new Promise(resolve => { capture.speechEnded = resolve; capture.finishTimer = setTimeout(resolve, 2500); });
          try { capture.recognizer.stop(); await ended; } catch { /* already stopped */ }
          clearTimeout(capture.finishTimer);
        }
        stopSession(capture);
        let file = recorded ? await Promise.race([recorded, new Promise(resolve => setTimeout(() => resolve(null), 4000))]) : null;
        if (!current()) return;
        if (file?.size > maxVoiceBytes || !file?.size) file = null;
        let message = capture.error || '';
        let text = capture.final.trim();
        if (native && file) {
          try { text = await native.postMessage({ audio: (await asDataURL(file)).split(',')[1], mime: file.type, locale: voiceLocale() }); }
          catch { message = speechError; }
        }
        if (!current()) return;
        if (wantsText && !text && !message) message = speechError;
        if (keepAudio && !file) message = 'No audio was captured, or the clip was too large. Try a shorter recording.';
        const dictated = typeof text === 'string' ? text.trim() : '';
        if (dictated) onInsert(dictated);
        setTranscript(''); setAudio(keepAudio && file ? { file, seconds } : null);
        setStatus(dictated ? 'Dictation added. You can edit it in your entry.' : message || 'You can preview or save this recording.');
        session.current = null; setPhase('');
      };
      if (Speech) {
        const recognizer = new Speech();
        capture.recognizer = recognizer;
        recognizer.lang = voiceLocale();
        recognizer.continuous = true;
        recognizer.interimResults = true;
        recognizer.onresult = event => {
          if (!current()) return;
          capture.final = Array.from(event.results).filter(result => result.isFinal).map(result => result[0].transcript.trim()).join(' ');
          capture.interim = Array.from(event.results).filter(result => !result.isFinal).map(result => result[0].transcript.trim()).join(' ');
          setTranscript([capture.final, capture.interim].filter(Boolean).join(' '));
        };
        recognizer.onerror = () => { capture.error = speechError; if (!keepAudio) capture.finish(true); else setStatus('Dictation unavailable. Audio is still recording.'); };
        recognizer.onend = () => { capture.speechEnded?.(); capture.speechFinished = true; if (!keepAudio) capture.finish(true); };
        try { recognizer.start(); } catch (error) { if (!keepAudio) throw error; capture.error = speechError; }
      }
      capture.timer = setTimeout(() => capture.finish(capture.speechFinished), maxSeconds * 1000);
      setPhase('recording'); setStatus(native ? 'Listening. Text appears when you stop.' : 'Listening…');
    } catch (error) {
      stopSession(capture, true);
      if (active.current && session.current === capture) {
        session.current = null; setPhase(''); setStatus(error.name === 'NotAllowedError' ? 'Microphone access was denied. Allow it in your browser or iPhone settings, then try again.' : 'Couldn’t start the microphone. Try again or use keyboard dictation.');
      }
    }
  };

  const attach = async () => {
    setBusy(true); setStatus('Encrypting and saving your recording…');
    try {
      const clip = await saveVoice(audio.file, pairingCode(), audio.seconds, transfers.current.signal);
      if (active.current) { onAttach(clip); setAudio(null); setStatus('Voice clip attached. It will appear on your paired devices after sync.'); }
    } catch (error) {
      if (active.current) setStatus(error.message || 'The clip couldn’t be saved. Try again.');
    } finally { if (active.current) setBusy(false); }
  };

  const play = async clip => {
    setLoadingClip(clip.id);
    try {
      const file = await loadVoice(clip, pairingCode(), transfers.current.signal);
      if (!active.current) return;
      if (player) { URL.revokeObjectURL(player.url); urls.current.delete(player.url); }
      const url = URL.createObjectURL(file);
      urls.current.add(url);
      setPlayer({ id: clip.id, url });
    } catch (error) {
      if (active.current) setStatus(error.message || 'This recording couldn’t be opened.');
    } finally { if (active.current) setLoadingClip(null); }
  };
  const available = Boolean(speechBridge() || speechBrowser());
  const isDraft = Boolean(audio);
  return <section className="j-voice" aria-label="Journal voice" data-voice-draft={phase || isDraft ? 'true' : undefined}>
    <div className="j-voice-actions">
      {phase === 'recording' ? <button type="button" onClick={() => session.current?.finish(session.current.speechFinished)}>Stop {mode === 'text' ? 'dictation' : 'recording'}</button> :
        phase ? <span>{phase === 'starting' ? 'Starting microphone…' : 'Finishing…'}</span> :
          !isDraft && <>
            <button type="button" disabled={!available} onClick={() => start('text')}><i className="fas fa-microphone" aria-hidden="true" /> Dictate</button>
            <button type="button" disabled={!recordingOK()} onClick={() => start('audio')}>Record audio</button>
            <button type="button" disabled={!available || !recordingOK()} onClick={() => start('both')}>Dictate + record</button>
          </>}
    </div>
    {!available && <p className="j-voice-status">This browser doesn’t offer in-page dictation. Click in your entry and use your keyboard’s dictation instead.</p>}
    {available && !speechBridge() && !phase && !isDraft && <p className="j-voice-status">Dictation uses your browser’s speech service. Saved audio is encrypted separately.</p>}
    {status && <p className="j-voice-status" role="status">{status}</p>}
    {transcript && phase && <p className="j-voice-transcript">{transcript}</p>}
    {audio && preview && <div className="j-voice-clip"><audio src={preview} controls preload="metadata" aria-label="Preview your recording" /></div>}
    {!phase && isDraft && <div className="j-voice-actions">
      {audio && <button type="button" onClick={attach} disabled={busy}>{busy ? 'Saving…' : 'Save audio to entry'}</button>}
      <button type="button" disabled={busy} onClick={() => { setAudio(null); setStatus('Recording discarded.'); }}>Discard audio</button>
    </div>}
    {clips.filter(validClip).map(clip => <div className="j-voice-clip" key={clip.id}>
      <span>Voice clip · {Number.isFinite(clip.seconds) ? `${clip.seconds}s` : 'Audio'}</span>
      {player?.id === clip.id ? <audio key={player.url} src={player.url} controls preload="metadata" onError={() => setStatus('This browser couldn’t play the recording. You can still download it.')} /> :
        <button type="button" disabled={loadingClip !== null} onClick={() => play(clip)}>{loadingClip === clip.id ? 'Opening…' : 'Open audio'}</button>}
      {player?.id === clip.id && <a href={player.url} download={`journal-voice.${clip.type.includes('mp4') ? 'm4a' : clip.type.split('/')[1].split(';')[0]}`}>Download</a>}
      <button type="button" onClick={() => {
        if (!window.confirm('Remove this audio attachment from the entry?')) return;
        if (player?.id === clip.id) { URL.revokeObjectURL(player.url); urls.current.delete(player.url); setPlayer(null); }
        onRemove(clip.id);
      }}>Remove</button>
    </div>)}
  </section>;
}
