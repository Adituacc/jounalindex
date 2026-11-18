import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './journal-voice.css';
import { pairingCode } from '../sync/client.js';
import { loadVoice, maxVoiceBytes, saveVoice, validClip } from '../sync/voice.js';
import { browserDictation } from '../utils/browserDictation.js';

const maxSeconds = 45;
const speechBridge = () => window.webkit?.messageHandlers?.journalSpeech;
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
  try { if (session.recorder?.state === 'recording') session.recorder.stop(); } catch { /* already stopped */ }
  session.stream?.getTracks().forEach(track => track.stop());
  if (discard) session.abort.abort();
}

export default function JournalVoice({ clips, editorRef, onInsert, onAttach, onRemove }) {
  const session = useRef(null);
  const transfers = useRef(new AbortController());
  const urls = useRef(new Set());
  const active = useRef(true);
  const [mode, setMode] = useState('');
  const [phase, setPhase] = useState('');
  const [audio, setAudio] = useState(null);
  const [preview, setPreview] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [player, setPlayer] = useState(null);
  const [loadingClip, setLoadingClip] = useState(null);
  const [targets, setTargets] = useState([]);
  const fileInput = useRef(null);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const refresh = () => {
      const next = [...editor.querySelectorAll('span[data-journal-voice]')];
      setTargets(last => last.length === next.length && last.every((node, i) => node === next[i]) ? last : next);
    };
    const observer = new window.MutationObserver(refresh);
    observer.observe(editor, { subtree: true, childList: true });
    refresh();
    return () => observer.disconnect();
  }, [editorRef]);
  useEffect(() => {
    active.current = true;
    transfers.current = new AbortController();
    const finish = () => {
      if (session.current?.finish) session.current.finish();
      document.querySelectorAll('.j-voice audio, .j-inline-voice audio').forEach(element => element.pause());
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

  const processAudio = async (capture, file, { wantsText, keepAudio, seconds }) => {
    if (session.current !== capture) return;
    setPhase('finishing');
    setStatus(wantsText ? 'Turning speech into text…' : 'Finishing…');
    let message = file?.size ? '' : 'No audio was captured. Try again.';
    if (keepAudio && file?.size > maxVoiceBytes) message = 'This clip is too large to save. Try a shorter recording.';
    let text = '';
    if (wantsText && file?.size) {
      try {
        const native = speechBridge();
        if (native && file.size <= maxVoiceBytes && file.type.split(';')[0] === 'audio/mp4') {
          try {
            const result = await native.postMessage({ audio: (await asDataURL(file)).split(',')[1], mime: file.type, locale: voiceLocale() });
            if (typeof result === 'string') text = result.trim();
          } catch { /* The local browser model can still transcribe the recording. */ }
        }
        if (!text) text = await browserDictation(file, {
          signal: capture.abort.signal,
          onStage: stage => {
            if (session.current === capture) setStatus(stage === 'setup' ? 'Preparing dictation. The first use downloads a speech model…' : 'Turning speech into text…');
          },
        });
      } catch (error) { message = error.message || speechError; }
    }
    if (session.current !== capture) return;
    if (text) onInsert(text);
    setAudio(keepAudio && file?.size && file.size <= maxVoiceBytes ? { file, seconds } : null);
    setStatus(message || (text ? 'Dictation added. You can edit it in your entry.' : wantsText ? speechError : 'Preview or save this recording below.'));
    session.current = null; setPhase('');
  };

  const start = async value => {
    if (session.current || busy) return;
    const keepAudio = value !== 'text';
    if (keepAudio && !pairingCode()) { setStatus('Pair your private workspace in Settings to save voice clips.'); return; }
    const capture = { parts: [], abort: new AbortController() };
    session.current = capture;
    setMode(value); setPhase('starting'); setStatus('Waiting for microphone…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
      if (session.current !== capture) { stream.getTracks().forEach(track => track.stop()); return; }
      capture.stream = stream;
      const mimeType = supportedTypes.find(type => window.MediaRecorder.isTypeSupported(type));
      const recorder = new window.MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 });
      capture.recorder = recorder;
      const recorded = new Promise(resolve => {
        recorder.ondataavailable = event => { if (event.data.size) capture.parts.push(event.data); };
        recorder.onstop = () => resolve(new Blob(capture.parts, { type: recorder.mimeType || capture.parts[0]?.type }));
        recorder.onerror = () => { resolve(null); capture.finish?.(); };
      });
      recorder.start();
      const started = window.performance.now();
      capture.finish = async () => {
        if (session.current !== capture || capture.finishing) return;
        capture.finishing = true;
        const seconds = Math.max(1, Math.min(maxSeconds, Math.round((window.performance.now() - started) / 1000)));
        stopSession(capture);
        setPhase('finishing');
        let timeout;
        const file = await Promise.race([recorded, new Promise(resolve => { timeout = setTimeout(() => resolve(null), 4000); })]);
        clearTimeout(timeout);
        await processAudio(capture, file, { wantsText: value !== 'audio', keepAudio, seconds });
      };
      capture.timer = setTimeout(capture.finish, maxSeconds * 1000);
      setPhase('recording'); setStatus(value === 'audio' ? 'Recording…' : 'Listening. Text appears when you stop.');
    } catch (error) {
      stopSession(capture, true);
      if (session.current === capture) {
        session.current = null; setPhase('');
        setStatus(error.name === 'NotAllowedError' ? 'Microphone access was denied. Allow it in Settings, open Journal in your browser, or transcribe an audio file.' : 'Couldn’t start the microphone. Try again or transcribe an audio file.');
      }
    }
  };

  const transcribeFile = event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || session.current || busy) return;
    if (file.size > 12000000) { setStatus('Choose a short audio file under 12 MB.'); return; }
    const capture = { abort: new AbortController() };
    session.current = capture;
    processAudio(capture, file, { wantsText: true, keepAudio: false });
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
  const isDraft = Boolean(audio);
  return <><section className="j-voice" aria-label="Journal voice" data-voice-draft={phase || isDraft ? 'true' : undefined}>
    <div className="j-voice-actions">
      {phase === 'recording' ? <button type="button" onClick={() => session.current?.finish()}>Stop {mode === 'text' ? 'dictation' : 'recording'}</button> :
        phase ? <button type="button" onClick={() => {
          if (session.current) stopSession(session.current, true);
          session.current = null; setPhase(''); setStatus('Cancelled.');
        }}>Cancel</button> :
          !isDraft && <>
            <button type="button" disabled={!recordingOK()} onClick={() => start('text')}><i className="fas fa-microphone" aria-hidden="true" /> Dictate</button>
            <button type="button" disabled={!recordingOK()} onClick={() => start('audio')}>Record audio</button>
            <button type="button" disabled={!recordingOK()} onClick={() => start('both')}>Dictate + record</button>
            <button type="button" onClick={() => fileInput.current?.click()}>Transcribe audio file</button>
          </>}
    </div>
    <input hidden type="file" ref={fileInput} accept="audio/*,.m4a,.mp3,.wav,.webm" onChange={transcribeFile} />
    {!recordingOK() && <p className="j-voice-status">This browser can’t open the microphone. Transcribe an audio file, use keyboard dictation, or open Journal in your regular browser.</p>}
    {status && <p className="j-voice-status" role="status">{status}</p>}
    {audio && preview && <div className="j-voice-clip"><audio src={preview} controls preload="metadata" aria-label="Preview your recording" /></div>}
    {!phase && isDraft && <div className="j-voice-actions">
      {audio && <button type="button" onClick={attach} disabled={busy}>{busy ? 'Saving…' : 'Save audio to entry'}</button>}
      <button type="button" disabled={busy} onClick={() => { setAudio(null); setStatus('Recording discarded.'); }}>Discard audio</button>
    </div>}
  </section>
    {targets.map((target, index) => {
      const clip = clips.find(item => validClip(item) && item.id === target.dataset.journalVoice);
      if (!clip) return null;
      return createPortal(<span className="j-voice-clip j-inline-voice" role="group" aria-label="Voice clip">
      <span>Voice clip · {Number.isFinite(clip.seconds) ? `${clip.seconds}s` : 'Audio'}</span>
      {player?.id === clip.id ? <audio key={player.url} src={player.url} controls preload="metadata" onError={() => setStatus('This browser couldn’t play the recording. You can still download it.')} /> :
        <button type="button" disabled={loadingClip !== null} onClick={() => play(clip)}>{loadingClip === clip.id ? 'Opening…' : 'Open audio'}</button>}
      {player?.id === clip.id && <a href={player.url} download={`journal-voice.${clip.type.includes('mp4') ? 'm4a' : clip.type.split('/')[1].split(';')[0]}`}>Download</a>}
      <button type="button" onClick={() => {
        if (!window.confirm('Remove this audio attachment from the entry?')) return;
        if (player?.id === clip.id) { URL.revokeObjectURL(player.url); urls.current.delete(player.url); setPlayer(null); }
        onRemove(clip.id);
      }}>Remove</button>
      </span>, target, clip.id + ':' + index);
    })}
  </>;
}
