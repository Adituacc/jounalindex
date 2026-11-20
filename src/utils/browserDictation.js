import { maxRecordingSeconds } from '../sync/voice.js';
const rate = 16000;
const maxSamples = rate * (maxRecordingSeconds + 2);
let worker;

export async function browserDictation(file, { signal, onStage } = {}) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline || !window.Worker) throw new Error('Try opening Journal in Chrome, Brave, or Safari to use dictation.');
  signal?.throwIfAborted();
  const context = new Offline(1, 1, rate);
  const decoded = await context.decodeAudioData(await file.arrayBuffer());
  signal?.throwIfAborted();
  if (decoded.length > maxSamples) throw new Error('Choose an audio clip of five minutes or less.');
  const samples = new Float32Array(decoded.length);
  for (let i = 0; i < decoded.numberOfChannels; i++) {
    const channel = decoded.getChannelData(i);
    for (let j = 0; j < samples.length; j++) samples[j] += channel[j] / decoded.numberOfChannels;
  }
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  if (samples.length < rate / 4 || energy < samples.length * 0.00000025) throw new Error('No speech was detected. Check your microphone and try again.');
  const activeWorker = worker ??= new Worker(new URL('./dictation.worker.js', import.meta.url), { type: 'module' });
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const close = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
      activeWorker.removeEventListener('message', receive);
      activeWorker.removeEventListener('error', fail);
    };
    const cancel = () => {
      close();
      activeWorker.terminate();
      if (worker === activeWorker) worker = undefined;
      reject(signal?.reason || new Error('Dictation was cancelled.'));
    };
    const fail = () => {
      close();
      activeWorker.terminate();
      if (worker === activeWorker) worker = undefined;
      reject(new Error('Couldn’t load the speech model. Check your connection and try again.'));
    };
    const receive = ({ data }) => {
      if (data.id !== id) return;
      if (data.stage) { onStage?.(data.stage); return; }
      if (data.failed) { fail(); return; }
      close();
      resolve(data.text);
    };
    const timeout = setTimeout(fail, 600000);
    signal?.addEventListener('abort', cancel, { once: true });
    activeWorker.addEventListener('message', receive);
    activeWorker.addEventListener('error', fail);
    try { activeWorker.postMessage({ id, samples }, [samples.buffer]); }
    catch { fail(); }
  });
}
