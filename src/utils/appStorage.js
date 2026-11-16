import { strToU8, strFromU8, zlibSync, unzlibSync } from 'fflate';
const prefix = 'JI-Z1:';
const cache = new Map();
function encode(bytes) {
  const chunks=[];
  for (let i=0;i<bytes.length;i+=8192) chunks.push(String.fromCharCode(...bytes.subarray(i,i+8192)));
  return btoa(chunks.join(''));
}
function decode(text) { return Uint8Array.from(atob(text), c => c.charCodeAt(0)); }
// Preserve synchronous saving and legacy data while fitting large backups into WebKit's quota.
export const appStorage = {
  getItem(key) {
    const raw = window.localStorage.getItem(key), hit = cache.get(key);
    if (hit?.raw === raw) return hit.value;
    const value = raw?.startsWith(prefix) ? strFromU8(unzlibSync(decode(raw.slice(prefix.length)))) : raw;
    cache.set(key,{raw,value});
    return value;
  },
  setItem(key,value) {
    const text = String(value);
    const compressed = text.length >= 8192 ? prefix + encode(zlibSync(strToU8(text),{level:1})) : text;
    const raw = compressed.length < text.length ? compressed : text;
    window.localStorage.setItem(key,raw);
    cache.set(key,{raw,value:text});
    window.dispatchEvent(new CustomEvent('workspace:local-change',{detail:{key}}));
  },
  removeItem(key) {
    window.localStorage.removeItem(key);cache.delete(key);
    window.dispatchEvent(new CustomEvent('workspace:local-change',{detail:{key}}));
  },
};
