import { readdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
export default function offlinePlugin() {
  return { name:'journal-offline', async closeBundle() {
    const assets=(await readdir('dist/assets')).filter(name=>/\.(js|css|woff2)$/.test(name)).map(name=>`/assets/${name}`);
    const revision=createHash('sha256').update(await readFile('dist/index.html')).digest('hex').slice(0,12);
    await writeFile('dist/sw.js',`const CACHE='journal-index-${revision}'; const ASSETS=${JSON.stringify(['/',...assets])};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS).then(()=>self.skipWaiting())));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('journal-index-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('message',event=>{if(event.data==='activate')self.skipWaiting();});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname==='/sw.js')return;if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('/')));return;}if(ASSETS.includes(url.pathname))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));});`);
  }};
}
