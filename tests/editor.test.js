import test from 'node:test';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build, stop } from 'esbuild';
test('the journal flushes the final keystroke on navigation and backgrounding, and reopens the selected note',async () => {
  const dom=new JSDOM('<div id="root"></div>',{url:'https://editor.test',pretendToBeVisual:true});
  for(const key of ['window','document','localStorage','Event']) globalThis[key]=dom.window[key];
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  window.matchMedia=() => ({matches:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  localStorage.setItem('notebookData',JSON.stringify({folders:[{id:'daily-journal',name:'Daily Journal',icon:'far fa-calendar-alt'}],notes:{a:{id:'a',date:'2026-11-16',folderId:'daily-journal',content:'<p>A &amp; B</p>',tags:[],pinned:false}}}));
  localStorage.setItem('ji_last_note','a');
  const bundle=await build({entryPoints:['tests/editor-fixture.jsx'],bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
  const originalChannel=globalThis.MessageChannel; globalThis.MessageChannel=undefined;
  const {act,mount}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  globalThis.MessageChannel=originalChannel;
  let root;
  try {
    await act(async () => {root=mount(document.getElementById('root'));});
    let editor=document.querySelector('[contenteditable]');assert.ok(editor);assert.equal(editor.innerHTML,'<p>A &amp; B</p>');assert.ok(document.body.textContent.includes('A & B'));
    await act(async () => {editor.innerHTML='<p>The final character!</p>';editor.dispatchEvent(new Event('input',{bubbles:true}));root.unmount();});
    assert.equal(JSON.parse(localStorage.notebookData).notes.a.content,'<p>The final character!</p>');
    await act(async () => {root=mount(document.getElementById('root'));});
    editor=document.querySelector('[contenteditable]');assert.equal(editor.innerHTML,'<p>The final character!</p>');
    await act(async () => {editor.innerHTML='<p>Saved before sleep.</p>';editor.dispatchEvent(new Event('input',{bubbles:true}));window.dispatchEvent(new Event('workspace:flush'));});
    assert.equal(JSON.parse(localStorage.notebookData).notes.a.content,'<p>Saved before sleep.</p>');
  } finally {if(root)await act(async()=>root.unmount());dom.window.close();delete globalThis.IS_REACT_ACT_ENVIRONMENT;stop();for (const handle of process._getActiveHandles()) { if (handle.constructor.name === 'MessagePort') handle.unref(); }}
});
