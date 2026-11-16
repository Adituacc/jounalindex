import test from 'node:test';
import process from 'node:process';
import assert from 'node:assert/strict';
import { createHandler } from '../api/workspace.js';
import { createPairingCode,keysFor,seal } from '../src/sync/crypto.js';
import { emptyDocument } from '../src/sync/model.js';
function response() { return {headers:{},code:200,setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(v){this.body=v;return this;},end(){return this;}}; }
test('private API authenticates, requires a revision and uses conditional private writes', async () => {
  const keys=await keysFor(createPairingCode());
  process.env.SYNC_WORKSPACE_ID=keys.workspace;process.env.BLOB_READ_WRITE_TOKEN='fixture-token';
  let reads=0,writes=0;
  const handler=createHandler({get:async (_path,opts) => {reads++;assert.equal(opts.access,'private');assert.equal(opts.useCache,false);return null;},put:async (_path,_body,opts) => {writes++;assert.equal(opts.access,'private');assert.equal(opts.addRandomSuffix,false);if(opts.ifMatch)assert.equal(opts.ifMatch,'revision');else assert.equal(opts.allowOverwrite,false);return {etag:'next'};}});
  let res=response();await handler({method:'GET',headers:{}},res);assert.equal(res.code,401);assert.equal(reads,0);
  const headers={authorization:`Bearer ${keys.auth}`};res=response();await handler({method:'GET',headers},res);assert.equal(res.code,404);
  const body=await seal(emptyDocument(),keys.encryption,keys.workspace);
  res=response();await handler({method:'PUT',headers,body},res);assert.equal(res.code,428);assert.equal(writes,0);
  res=response();await handler({method:'PUT',headers:{...headers,'if-none-match':'*'},body},res);assert.equal(res.code,200);assert.equal(res.headers.ETag,'next');
  res=response();await handler({method:'PUT',headers:{...headers,'if-match':'revision'},body},res);assert.equal(res.code,200);assert.equal(writes,2);
  res=response();await handler({method:'PUT',headers,body:{version:1,iv:'wrong',data:'plaintext'}},res);assert.equal(res.code,400);
  delete process.env.BLOB_READ_WRITE_TOKEN;res=response();await handler({method:'GET',headers},res);assert.equal(res.code,503);
  delete process.env.SYNC_WORKSPACE_ID;
});
