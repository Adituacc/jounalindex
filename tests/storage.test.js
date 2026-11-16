import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { appStorage } from '../src/utils/appStorage.js';
test('large values fit a small phone quota and backups still receive the exact original text', () => {
  const dom=new JSDOM('',{url:'https://storage.test',storageQuota:20000});
  globalThis.window=dom.window;globalThis.CustomEvent=dom.window.CustomEvent;
  try {
    const value=JSON.stringify(Array.from({length:1000},(_,id)=>({id,content:'Journal entry with rich <p>formatting &amp; exact characters.</p>'})));
    assert.throws(()=>window.localStorage.setItem('large',value),/quota/i);
    appStorage.setItem('large',value);assert.equal(appStorage.getItem('large'),value);assert.ok(window.localStorage.getItem('large').length < 20000);
    window.localStorage.setItem('legacy','{"content":"unchanged"}');assert.equal(appStorage.getItem('legacy'),'{"content":"unchanged"}');
    appStorage.removeItem('large');assert.equal(appStorage.getItem('large'),null);
  }finally{dom.window.close();}
});
