import { decode, encode, keysFor } from './crypto.js';

export const maxVoiceBytes = 1500000;
export const maxRecordingSeconds = 300;
export const maxAudioBytes = 12000000;
export const maxVideoBytes = 80000000;
const chunkSize = 2800000;
const maxChunks = Math.ceil(maxVideoBytes / chunkSize);
const idPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const mediaPattern = /^(?:audio\/(?:mp4|webm|ogg|aac|mpeg)|video\/(?:mp4|webm))(?:\s*;[\w=., "'-]+)?$/i;
export const validClipId = id => typeof id === 'string' && idPattern.test(id);
export const validClip = clip => clip && validClipId(clip.id) && typeof clip.type === 'string' && mediaPattern.test(clip.type)
  && (clip.parts === undefined || (Number.isInteger(clip.parts) && clip.parts >= 1 && clip.parts <= maxChunks));
export const isVideoClip = type => type.startsWith('video/');
export const extensionFor = type => type.includes('mp4') ? (isVideoClip(type) ? 'mp4' : 'm4a') : type.split('/')[1].split(';')[0];
const binding = (workspace, clip) => new TextEncoder().encode(JSON.stringify(['voice-v1', workspace, clip.id, clip.type]));

export async function sealVoice(blob, keys, clip) {
  if (!validClip(clip) || !blob.size || blob.size > maxVoiceBytes) throw new Error('This recording is too large or could not be read.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: binding(keys.workspace, clip) }, keys.encryption, await blob.arrayBuffer());
  return { version: 1, iv: encode(iv), data: encode(new Uint8Array(data)) };
}

export async function openVoice(envelope, keys, clip) {
  if (!validClip(clip) || envelope?.version !== 1 || !/^[\w-]{16}$/.test(envelope.iv) || typeof envelope.data !== 'string' || envelope.data.length > 2000050) throw new Error('This voice clip could not be read.');
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(envelope.iv), additionalData: binding(keys.workspace, clip) }, keys.encryption, decode(envelope.data));
  return new Blob([bytes], { type: clip.type });
}

async function request(clip, keys, method, body, signal, part) {
  const query = part === undefined ? `voice=${clip.id}` : `media=${clip.id}&part=${part}`;
  const response = await fetch(`/api/workspace?${query}`, {
    method, cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25000)]) : AbortSignal.timeout(25000),
    headers: { Authorization: `Bearer ${keys.auth}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (method === 'PUT' && part !== undefined && response.status === 412) return;
  if (!response.ok) throw new Error('Couldn’t transfer the recording. Check your connection and try again.');
  return response.json();
}

function mediaBinding(workspace, clip, part) {
  return new TextEncoder().encode(JSON.stringify(['journal-media-v1', workspace, clip.id, clip.type, clip.parts, part]));
}

async function eachPart(count, signal, handler, onProgress) {
  let next = 0, done = 0, error;
  const values = Array(count);
  await Promise.all(Array.from({ length: Math.min(3, count) }, async () => {
    while (!error && next < count) {
      const index = next++;
      try {
        signal?.throwIfAborted();
        values[index] = await handler(index);
        onProgress?.(++done, count);
      } catch (cause) { error ??= cause; }
    }
  }));
  if (error) throw error;
  return values;
}

export function prepareRecording(blob, seconds) {
  const clip = { id: crypto.randomUUID(), type: blob.type, parts: Math.ceil(blob.size / chunkSize), seconds, created: new Date().toISOString() };
  if (!validClip(clip) || blob.size > (isVideoClip(blob.type) ? maxVideoBytes : maxAudioBytes)) {
    throw new Error('This recording is too large or its format is unsupported. You can download a copy.');
  }
  return clip;
}

export async function saveVoice(blob, code, seconds, signal, { clip = prepareRecording(blob, seconds), onProgress } = {}) {
  if (!code) throw new Error('Pair your private workspace in Settings to save recordings.');
  const keys = await keysFor(code);
  await eachPart(clip.parts, signal, async part => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: mediaBinding(keys.workspace, clip, part) }, keys.encryption,
      await blob.slice(part * chunkSize, (part + 1) * chunkSize).arrayBuffer());
    await request(clip, keys, 'PUT', { version: 1, iv: encode(iv), data: encode(new Uint8Array(data)) }, signal, part);
  }, onProgress);
  return clip;
}

export async function loadVoice(clip, code, signal, onProgress) {
  if (!code || !validClip(clip)) throw new Error('Pair your private workspace to open this recording.');
  const keys = await keysFor(code);
  if (clip.parts === undefined) return openVoice(await request(clip, keys, 'GET', undefined, signal), keys, clip);
  const parts = await eachPart(clip.parts, signal, async part => {
    const envelope = await request(clip, keys, 'GET', undefined, signal, part);
    if (envelope?.version !== 1 || !/^[\w-]{16}$/.test(envelope.iv) || typeof envelope.data !== 'string' || envelope.data.length > 3733370) throw new Error('This recording could not be read.');
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(envelope.iv), additionalData: mediaBinding(keys.workspace, clip, part) }, keys.encryption, decode(envelope.data));
  }, onProgress);
  return new Blob(parts, { type: clip.type });
}
