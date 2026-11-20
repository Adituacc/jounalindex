import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './journal-voice.css';
import { pairingCode } from '../sync/client.js';
import { extensionFor, isVideoClip, loadVoice, maxAudioBytes, maxRecordingSeconds, maxVideoBytes, maxVoiceBytes, prepareRecording, saveVoice, validClip } from '../sync/voice.js';
import { browserDictation } from '../utils/browserDictation.js';

const maxSeconds = maxRecordingSeconds;
const speechBridge = () => window.webkit?.messageHandlers?.journalSpeech;
const recordingOK = () => Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
const voiceLocale = () => navigator.language || 'en-IN';
const supportedTypes = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus'];
const videoTypes = ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'];
const clock = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
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
  clearInterval(session.clock);
  try { if (session.recorder?.state === 'recording') session.recorder.stop(); } catch { /* already stopped */ }
  session.stream?.getTracks().forEach(track => track.stop());
  if (discard) session.abort.abort();
}

export default function JournalVoice({ clips, editorRef, onInsert, onAttach, onRemove, onWrite }) {
  const session = useRef(null);
  const transfers = useRef(new AbortController());
  const urls = useRef(new Set());
  const active = useRef(true);
  const [mode, setMode] = useState('');
  const [phase, setPhase] = useState('');
  const [audio, setAudio] = useState(null);
  const [preview, setPreview] = useState('');
  const [camera, setCamera] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const cameraRef = useRef(null);
  const uploadRef = useRef(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [player, setPlayer] = useState(null);
  const [loadingClip, setLoadingClip] = useState(null);
  const [lastSavedClip, setLastSavedClip] = useState(null);
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
      const capture = session.current;
      if (capture?.finish) capture.finish();
      else if (capture?.starting) {
        stopSession(capture, true);
        session.current = null;
        setPhase('');
        setStatus('Recording cancelled.');
      }
      document.querySelectorAll('.j-voice audio, .j-inline-voice audio, .j-inline-voice video, .j-voice video[controls]').forEach(element => element.pause());
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
  useEffect(() => {
    if (cameraRef.current) cameraRef.current.srcObject = camera;
  }, [camera]);

  const processAudio = async (capture, file, { wantsText, keepAudio, seconds }) => {
    if (session.current !== capture) return;
    setPhase('finishing');
    setStatus(wantsText ? 'Turning speech into text…' : 'Finishing…');
    let message = file?.size ? '' : 'No audio was captured. Try again.';
    const cap = file && isVideoClip(file.type) ? maxVideoBytes : maxAudioBytes;
    if (keepAudio && file?.size > cap) message = 'This clip is too large to attach, but you can download it.';
    let text = '';
    if (wantsText && file?.size) {
      try {
        const native = speechBridge();
        if (native && seconds && seconds <= 45 && file.size <= maxVoiceBytes && file.type.split(';')[0] === 'audio/mp4') {
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
    if (file?.size && (keepAudio || (wantsText && !text))) {
      let clip;
      try { clip = prepareRecording(file, seconds); } catch { /* Still allow a file download. */ }
      setAudio({ file, seconds, clip });
    }
    setStatus(message || (text ? 'Dictation added. You can edit it in your entry.' : wantsText ? speechError : 'Preview the recording, then save it inside this note.'));
    session.current = null; setPhase('');
  };

  const start = async value => {
    if (session.current || busy) return;
    const keepAudio = value !== 'text';
    const video = value === 'video';
    const capture = { parts: [], abort: new AbortController(), starting: true };
    session.current = capture;
    setMode(value); setPhase('starting'); setElapsed(0); setStatus(video ? 'Waiting for camera and microphone…' : 'Waiting for microphone…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1 },
        video: video ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 20, max: 24 } } : false,
      });
      if (session.current !== capture) { stream.getTracks().forEach(track => track.stop()); return; }
      capture.stream = stream;
      const mimeType = (video ? videoTypes : supportedTypes).find(type => window.MediaRecorder.isTypeSupported(type));
      const recorder = new window.MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: video ? 48000 : 32000, ...(video ? { videoBitsPerSecond: 850000 } : {}) });
      capture.recorder = recorder;
      const recorded = new Promise(resolve => {
        recorder.ondataavailable = event => { if (event.data.size) capture.parts.push(event.data); };
        recorder.onstop = () => resolve(new Blob(capture.parts, { type: recorder.mimeType || capture.parts[0]?.type }));
        recorder.onerror = () => { resolve(null); capture.finish?.(); };
      });
      recorder.start(1000);
      capture.starting = false;
      if (video) setCamera(stream);
      const started = window.performance.now();
      capture.finish = async () => {
        if (session.current !== capture || capture.finishing) return;
        capture.finishing = true;
        const seconds = Math.max(1, Math.min(maxSeconds, Math.round((window.performance.now() - started) / 1000)));
        stopSession(capture);
        setCamera(null);
        setPhase('finishing');
        let timeout;
        const file = await Promise.race([recorded, new Promise(resolve => { timeout = setTimeout(() => resolve(null), 4000); })]);
        clearTimeout(timeout);
        await processAudio(capture, file, { wantsText: value === 'text' || value === 'both', keepAudio, seconds });
      };
      stream.getTracks().forEach(track => track.addEventListener('ended', capture.finish, { once: true }));
      capture.timer = setTimeout(capture.finish, maxSeconds * 1000);
      capture.clock = setInterval(() => setElapsed(Math.min(maxSeconds, Math.floor((window.performance.now() - started) / 1000))), 250);
      setPhase('recording'); setStatus(keepAudio && value !== 'both' ? 'Recording…' : 'Listening. Text appears when you stop.');
    } catch (error) {
      stopSession(capture, true);
      setCamera(null);
      if (session.current === capture) {
        session.current = null; setPhase('');
        setStatus(error.name === 'NotAllowedError' ? `Allow ${video ? 'camera and microphone' : 'microphone'} access in Settings, or open Journal in your regular browser.` : `Couldn’t start the ${video ? 'camera' : 'microphone'}.`);
      }
    }
  };

  const transcribeFile = event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || session.current || busy) return;
    if (file.size > maxAudioBytes) { setStatus('Choose an audio file under 12 MB.'); return; }
    const capture = { abort: new AbortController() };
    session.current = capture;
    processAudio(capture, file, { wantsText: true, keepAudio: false });
  };

  const attach = async () => {
    if (uploadRef.current || !audio?.clip) return;
    const upload = new AbortController();
    uploadRef.current = upload;
    setBusy(true); setStatus('Encrypting and saving your recording…');
    try {
      const clip = await saveVoice(audio.file, pairingCode(), audio.seconds, AbortSignal.any([upload.signal, transfers.current.signal]), {
        clip: audio.clip,
        onProgress: (done, total) => { if (active.current) setStatus(`Saving recording… ${Math.round(done / total * 100)}%`); },
      });
      if (active.current) { onAttach(clip); setAudio(null); setLastSavedClip(clip.id); setStatus('Recording saved in this note. You can keep writing.'); }
    } catch (error) {
      if (active.current) setStatus(upload.signal.aborted ? 'Upload stopped. Your preview is still here.' : error.message || 'The clip couldn’t be saved. Try again.');
    } finally { uploadRef.current = null; if (active.current) setBusy(false); }
  };

  const play = async clip => {
    setLoadingClip(clip.id);
    try {
      const file = await loadVoice(clip, pairingCode(), transfers.current.signal, (done, total) => {
        if (active.current && total > 1) setStatus(`Opening recording… ${Math.round(done / total * 100)}%`);
      });
      if (!active.current) return;
      if (player) { URL.revokeObjectURL(player.url); urls.current.delete(player.url); }
      const url = URL.createObjectURL(file);
      urls.current.add(url);
      setPlayer({ id: clip.id, url });
      setStatus('');
    } catch (error) {
      if (active.current) setStatus(error.message || 'This recording couldn’t be opened.');
    } finally { if (active.current) setLoadingClip(null); }
  };
  const isDraft = Boolean(audio);
  return <><section className="j-voice" aria-label="Journal voice" data-voice-draft={phase || isDraft ? 'true' : undefined}>
    <div className="j-voice-actions">
      {phase === 'recording' ? <>
        <button type="button" onClick={() => session.current?.finish()}>Stop {mode === 'text' ? 'dictation' : 'recording'}</button>
        <span className="j-voice-clock" aria-label="Recording time">{clock(elapsed)} / {clock(maxSeconds)}</span>
      </> :
        phase ? <button type="button" onClick={() => {
          if (session.current) stopSession(session.current, true);
          session.current = null; setPhase(''); setStatus('Cancelled.');
        }}>Cancel</button> :
          !isDraft && <>
            <button type="button" disabled={!recordingOK()} onClick={() => start('text')}><i className="fas fa-microphone" aria-hidden="true" /> Dictate</button>
            <button type="button" disabled={!recordingOK()} onClick={() => start('audio')}>Record audio</button>
            <button type="button" disabled={!recordingOK()} onClick={() => start('video')}><i className="fas fa-video" aria-hidden="true" /> Record video</button>
            <button type="button" disabled={!recordingOK()} onClick={() => start('both')}>Dictate + record</button>
            <button type="button" onClick={() => fileInput.current?.click()}>Transcribe audio file</button>
          </>}
    </div>
    <input hidden type="file" ref={fileInput} accept="audio/*,.m4a,.mp3,.wav,.webm" onChange={transcribeFile} />
    {!recordingOK() && <p className="j-voice-status">This browser can’t open the microphone. Transcribe an audio file, use keyboard dictation, or open Journal in your regular browser.</p>}
    {status && <p className="j-voice-status" role="status">{status}</p>}
    {camera && <video ref={cameraRef} className="j-journal-video" autoPlay muted playsInline aria-label="Live camera preview" />}
    {phase === 'finishing' && <div className="j-voice-actions">
      <button type="button" className="j-voice-write" onClick={() => onWrite()}>Keep writing</button>
    </div>}
    {audio && preview && <div className="j-voice-clip">
      {isVideoClip(audio.file.type) ? <video className="j-journal-video" src={preview} controls playsInline preload="metadata" aria-label="Preview your video" />
        : <audio src={preview} controls preload="metadata" aria-label="Preview your recording" />}
    </div>}
    {!phase && isDraft && <div className="j-voice-actions">
      {audio.clip && <button type="button" onClick={attach} disabled={busy}>{busy ? 'Saving…' : isVideoClip(audio.file.type) ? 'Save video to entry' : 'Save audio to entry'}</button>}
      {busy && <button type="button" onClick={() => uploadRef.current?.abort()}>Stop upload</button>}
      <button type="button" className="j-voice-write" onClick={() => onWrite()}>Keep writing</button>
      {preview && <a href={preview} download={`journal-recording.${extensionFor(audio.file.type)}`}>Download</a>}
      <button type="button" disabled={busy} onClick={() => { setAudio(null); setStatus('Recording discarded.'); }}>Discard recording</button>
    </div>}
    {!phase && !isDraft && lastSavedClip && <div className="j-voice-actions">
      <button type="button" className="j-voice-write" onClick={() => onWrite(lastSavedClip)}>Keep writing</button>
    </div>}
  </section>
    {targets.map((target, index) => {
      const clip = clips.find(item => validClip(item) && item.id === target.dataset.journalVoice);
      if (!clip) return null;
      const video = isVideoClip(clip.type);
      const label = video ? 'Video note' : 'Voice clip';
      const Player = video ? 'video' : 'audio';
      return createPortal(<span className="j-voice-clip j-inline-voice" role="group" aria-label={label}>
      <span>{label}{Number.isFinite(clip.seconds) ? ` · ${clock(clip.seconds)}` : ''}</span>
      {player?.id === clip.id ? <Player key={player.url} className={video ? 'j-journal-video' : undefined} src={player.url} controls playsInline preload="metadata" onError={() => setStatus('This browser couldn’t play the recording. You can still download it.')} /> :
        <button type="button" disabled={loadingClip !== null} onClick={() => play(clip)}>{loadingClip === clip.id ? 'Opening…' : video ? 'Open video' : 'Open audio'}</button>}
      {player?.id === clip.id && <a href={player.url} download={`journal-recording.${extensionFor(clip.type)}`}>Download</a>}
      <button type="button" className="j-voice-write" onClick={() => onWrite(clip.id)}>Write below</button>
      <button type="button" onClick={() => {
        if (!window.confirm('Remove this recording from the entry?')) return;
        if (player?.id === clip.id) { URL.revokeObjectURL(player.url); urls.current.delete(player.url); setPlayer(null); }
        if (lastSavedClip === clip.id) setLastSavedClip(null);
        onRemove(clip.id);
      }}>Remove</button>
      </span>, target, clip.id + ':' + index);
    })}
  </>;
}
