import test from 'node:test';
import process from 'node:process';
import assert from 'node:assert/strict';
import { createHandler } from '../api/workspace.js';
import { createPairingCode, keysFor } from '../src/sync/crypto.js';
import { loadVoice, openVoice, saveVoice, sealVoice } from '../src/sync/voice.js';

test('a voice clip can sync to another device but cannot be opened or swapped without the paired keys', async t => {
  const pair = createPairingCode();
  const keys = await keysFor(pair);
  const bytes = new Uint8Array([14, 38, 150, 235, 91]);
  const audio = new Blob([bytes], { type: 'audio/mp4' });
  const storage = new Map();
  process.env.SYNC_WORKSPACE_ID = keys.workspace;
  process.env.BLOB_READ_WRITE_TOKEN = 'voice-test';
  t.after(() => { delete process.env.SYNC_WORKSPACE_ID; delete process.env.BLOB_READ_WRITE_TOKEN; });
  const handler = createHandler({
    async get(path, options) {
      assert.equal(options.access, 'private');
      return storage.has(path) ? { stream: new Response(storage.get(path)).body } : null;
    },
    async put(path, body, options) {
      assert.equal(options.access, 'private');
      assert.equal(options.allowOverwrite, false);
      assert.match(path, /^journal-index\/voice-v1\/[\w-]+\.json$/);
      storage.set(path, body);
    },
  });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    let status = 200;
    let value;
    const res = {
      setHeader() {},
      status(code) { status = code; return this; },
      json(body) { value = body; return this; },
      end() {},
    };
    const headers = Object.fromEntries(Object.entries(options.headers || {}).map(([name, value]) => [name.toLowerCase(), value]));
    await handler({ url, method: options.method, headers, body: options.body ? JSON.parse(options.body) : undefined }, res);
    return Response.json(value ?? {}, { status });
  });
  const clip = await saveVoice(audio, pair, 3);
  assert.equal(clip.seconds, 3);
  assert.equal(storage.size, 1);
  const downloaded = await loadVoice(JSON.parse(JSON.stringify(clip)), pair);
  assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()), bytes);
  const unpaired = await fetch(`/api/workspace?voice=${clip.id}`, { method:'GET' });
  assert.equal(unpaired.status, 401);
  const envelope = await sealVoice(audio, keys, clip);
  await assert.rejects(openVoice(envelope, keys, { ...clip, id: crypto.randomUUID() }));
  await assert.rejects(openVoice(envelope, await keysFor(createPairingCode()), clip));
});
