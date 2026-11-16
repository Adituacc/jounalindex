const encoder = new TextEncoder();
export function encode(bytes) { return btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
export function decode(value) { return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0)); }
export const createPairingCode = () => `JI1.${encode(crypto.getRandomValues(new Uint8Array(32)))}`;
export async function keysFor(code) {
  if (!/^JI1\.[\w-]{43}$/.test(code)) throw new Error('Enter a complete Journal Index pairing code.');
  const master = await crypto.subtle.importKey('raw',decode(code.slice(4)),'HKDF',false,['deriveBits']);
  const derive = label => crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:encoder.encode('JournalIndex/v1'),info:encoder.encode(label)},master,256);
  const auth = encode(new Uint8Array(await derive('server-auth')));
  const workspace = encode(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(auth))));
  const encryption = await crypto.subtle.importKey('raw',await derive('end-to-end-encryption'),{name:'AES-GCM'},false,['encrypt','decrypt']);
  return { auth, workspace, encryption };
}
export async function seal(document, key, workspace) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const compressed = await new Response(new Blob([JSON.stringify(document)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(workspace)},key,compressed);
  return { version:1, iv:encode(iv), data:encode(new Uint8Array(ciphertext)) };
}
export async function open(envelope, key, workspace) {
  if (envelope?.version !== 1) throw new Error('Unsupported workspace format.');
  const plaintext = await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(envelope.iv),additionalData:encoder.encode(workspace)},key,decode(envelope.data));
  const text = await new Response(new Blob([plaintext]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  const document = JSON.parse(text);
  if (document?.version !== 1 || !document.records || typeof document.records !== 'object') throw new Error('Invalid workspace data.');
  return document;
}
