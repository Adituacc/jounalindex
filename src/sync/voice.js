import { decode, encode, keysFor } from './crypto.js';

export const maxVoiceBytes = 1500000;
const idPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const audioPattern = /^audio\/(mp4|webm|ogg|aac|mpeg)(?:;[\w=., -]+)?$/i;
export const validClip = clip => clip && idPattern.test(clip.id) && typeof clip.type === 'string' && audioPattern.test(clip.type);
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

async function request(clip, keys, method, body, signal) {
  const response = await fetch(`/api/workspace?voice=${encodeURIComponent(clip.id)}`, {
    method, cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25000)]) : AbortSignal.timeout(25000),
    headers: { Authorization: `Bearer ${keys.auth}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error('Voice storage couldn’t be reached. Please check your connection and try again.');
  return response.json();
}

export async function saveVoice(blob, code, seconds, signal) {
  if (!code) throw new Error('Pair your private workspace in Settings to save voice clips.');
  const keys = await keysFor(code);
  const clip = { id: crypto.randomUUID(), type: blob.type, seconds, created: new Date().toISOString() };
  await request(clip, keys, 'PUT', await sealVoice(blob, keys, clip), signal);
  return clip;
}

export async function loadVoice(clip, code, signal) {
  if (!code || !validClip(clip)) throw new Error('Pair your private workspace to open this recording.');
  const keys = await keysFor(code);
  return openVoice(await request(clip, keys, 'GET', undefined, signal), keys, clip);
}
