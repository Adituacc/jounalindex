import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { indexedDB } from 'fake-indexeddb';
import { emptyDocument,flatten,observe,materialize } from '../src/sync/model.js';
import { createPairingCode,keysFor,seal,open } from '../src/sync/crypto.js';
test('real client pairs, sends edits, receives edits, defers while typing, and retries a concurrent write',async () => {
  const dom=new JSDOM('<input id="editing">',{url:'https://journal.test',pretendToBeVisual:true});
  for (const key of ['window','document','localStorage','Storage','Event']) globalThis[key]=dom.window[key];
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  globalThis.indexedDB=indexedDB;
  const code=createPairingCode(), keys=await keysFor(code);
  let remote=observe(emptyDocument(),flatten({notebookData:JSON.stringify({folders:[{id:'daily',name:'Daily'}],notes:{a:{id:'a',folderId:'daily',content:'Mac original',tags:[]}}})}),'mac',1),tag='revision-1',writes=0,race=false;
  globalThis.fetch=async (_url,options={}) => {
    assert.equal(options.headers.Authorization,`Bearer ${keys.auth}`);
    if(options.method==='PUT') {
      if(race) { race=false;tag='raced-revision';return new Response('{}',{status:412}); }
      assert.equal(options.headers['If-Match'],tag);
      remote=await open(JSON.parse(options.body),keys.encryption,keys.workspace);tag=`revision-${++writes+1}`;
      return new Response('{}',{status:200,headers:{ETag:tag}});
    }
    if(options.headers['If-None-Match']===tag) return new Response(null,{status:304,headers:{ETag:tag}});
    return new Response(JSON.stringify(await seal(remote,keys.encryption,keys.workspace)),{status:200,headers:{ETag:tag}});
  };
  const client=await import('../src/sync/client.js');client.startSync();
  try {
    await client.connect(code);
    assert.equal(client.getStatus().state,'synced',client.getStatus().message);
    assert.equal(JSON.parse(localStorage.getItem('notebookData')).notes.a.content,'Mac original');
    const edit=JSON.parse(localStorage.notebookData);edit.notes.a.content='Phone edit';localStorage.setItem('notebookData',JSON.stringify(edit));
    await client.syncNow();assert.equal(JSON.parse(materialize(remote.records).notebookData).notes.a.content,'Phone edit');
    const next=JSON.parse(materialize(remote.records).notebookData);next.notes.b={id:'b',folderId:'daily',content:'From Mac',tags:[]};
    remote=observe(remote,flatten({notebookData:JSON.stringify(next)}),'mac',30);tag='new-mac-revision';
    document.getElementById('editing').focus();await client.syncNow();assert.equal(client.getStatus().state,'pending');assert.ok(!JSON.parse(localStorage.notebookData).notes.b);
    document.getElementById('editing').blur();await client.syncNow();assert.equal(JSON.parse(localStorage.notebookData).notes.b.content,'From Mac');
    const last=JSON.parse(localStorage.notebookData);last.notes.a.content='Race-safe';localStorage.setItem('notebookData',JSON.stringify(last));race=true;
    await client.syncNow();assert.equal(client.getStatus().state,'pending');await client.syncNow();
    assert.equal(JSON.parse(materialize(remote.records).notebookData).notes.a.content,'Race-safe');assert.equal(client.getStatus().state,'synced');
    Object.defineProperty(navigator,'onLine',{value:false,configurable:true});await client.syncNow();assert.equal(client.getStatus().state,'offline');
  } finally {client.stopSync();dom.window.close();}
});
