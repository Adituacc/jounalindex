import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDocument, flatten, materialize, merge, observe } from '../src/sync/model.js';
import { createPairingCode, keysFor, open, seal } from '../src/sync/crypto.js';
const fixture = notes => ({ notebookData:JSON.stringify({folders:[{id:'daily',name:'Daily'}],notes}) });
const note = (id,content) => ({id,folderId:'daily',content,tags:[],date:'2026-11-16'});
const seed = () => observe(emptyDocument(),flatten(fixture({a:note('a','original')})),'seed',1);
test('complete storage round-trip preserves every supported key and rich text', () => {
  const storage = {...fixture({a:note('a','<h2>A &amp; B</h2><p>Line<br>two</p>')}),tz_trades:JSON.stringify([{id:'t1',notes:'private',pnl:3}]),tz_settings:JSON.stringify({timezone:'Asia/Kolkata',startBalance:2000}),tz_hl_addr:'0x123','lifetracker-notes':JSON.stringify([{id:'n1',content:'hello'}])};
  const result = materialize(observe(emptyDocument(),flatten(storage),'a',1).records);
  for (const key of Object.keys(storage)) { if (key==='tz_hl_addr') assert.equal(result[key],storage[key]); else assert.deepEqual(JSON.parse(result[key]),JSON.parse(storage[key])); }
});
test('offline edits to different notes merge in both directions', () => {
  const base=seed(), original=JSON.parse(materialize(base.records).notebookData);
  const a=observe(base,flatten(fixture({...original.notes,a:note('a','Mac edit')})),'mac',10);
  const b=observe(base,flatten(fixture({...original.notes,b:note('b','Phone note')})),'phone',20);
  const one=JSON.parse(materialize(merge(a,b).records).notebookData), two=JSON.parse(materialize(merge(b,a).records).notebookData);
  assert.deepEqual(one,two); assert.equal(one.notes.a.content,'Mac edit'); assert.equal(one.notes.b.content,'Phone note');
});
test('same-note simultaneous edits retain both versions with a stable recovery copy', () => {
  const base=seed(), a=observe(base,flatten(fixture({a:note('a','Mac edit')})),'mac',10), b=observe(base,flatten(fixture({a:note('a','Phone edit')})),'phone',20);
  const merged=merge(a,b), reversed=merge(b,a);
  assert.deepEqual(materialize(merged.records),materialize(reversed.records));
  const notes=Object.values(JSON.parse(materialize(merged.records).notebookData).notes);
  assert.equal(notes.length,2); assert.deepEqual(new Set(notes.map(n=>n.content)),new Set(['Mac edit','Phone edit']));
  assert.deepEqual(merge(merged,b).records,merged.records);
});
test('deletions propagate and an edited/deleted conflict remains recoverable', () => {
  const base=seed(), deleted=observe(base,flatten(fixture({})),'mac',30);
  assert.equal(Object.keys(JSON.parse(materialize(merge(base,deleted).records).notebookData).notes).length,0);
  const edited=observe(base,flatten(fixture({a:note('a','unsent edit')})),'phone',20);
  const notes=Object.values(JSON.parse(materialize(merge(deleted,edited).records).notebookData).notes);
  assert.equal(notes.length,1); assert.equal(notes[0].content,'unsent edit'); assert.ok(notes[0].recoveredFrom);
});
test('later edits causally replace older edits without spurious conflicts', () => {
  const first=observe(seed(),flatten(fixture({a:note('a','first')})),'mac',10);
  const next=observe(first,flatten(fixture({a:note('a','next')})),'phone',20);
  const merged=merge(first,next);
  assert.equal(Object.keys(merged.records).filter(k=>k.startsWith('recovery/')).length,0);
  assert.equal(JSON.parse(materialize(merged.records).notebookData).notes.a.content,'next');
});
test('AES-GCM encrypts, compresses and authenticates the workspace', async () => {
  const keys=await keysFor(createPairingCode()), other=await keysFor(createPairingCode());
  const envelope=await seal(seed(),keys.encryption,keys.workspace);
  assert.ok(!JSON.stringify(envelope).includes('original'));
  assert.deepEqual(await open(envelope,keys.encryption,keys.workspace),seed());
  await assert.rejects(open(envelope,other.encryption,other.workspace));
  await assert.rejects(open({...envelope,iv:envelope.iv.slice(0,-1)+(envelope.iv.endsWith('A')?'B':'A')},keys.encryption,keys.workspace));
  await assert.rejects(keysFor('short'));
});
