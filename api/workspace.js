import { createHash, timingSafeEqual } from 'node:crypto';
import { get, put, BlobPreconditionFailedError } from '@vercel/blob';
const path = 'journal-index/private-workspace-v1.json';
export function createHandler(storage = { get, put }) { return async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  const expected = process.env.SYNC_WORKSPACE_ID || '';
  if (!expected || !process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({error:'Private sync is not configured yet. Local saving is available.'});
  const auth = req.headers.authorization?.match(/^Bearer ([\w-]{43})$/)?.[1];
  const actual = auth ? createHash('sha256').update(auth).digest('base64url') : '';
  if (actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual),Buffer.from(expected))) return res.status(401).json({error:'This pairing code does not match this private workspace.'});
  try {
    if (req.method === 'GET') {
      const result = await storage.get(path,{access:'private',useCache:false,ifNoneMatch:req.headers['if-none-match']});
      if (!result) return res.status(404).json({error:'Workspace has not been uploaded yet.'});
      res.setHeader('ETag',result.blob.etag);
      if (result.statusCode === 304) return res.status(304).end();
      return res.status(200).json(JSON.parse(await new Response(result.stream).text()));
    }
    if (req.method === 'PUT') {
      const body = req.body;
      if (body?.version !== 1 || !/^[\w-]{16}$/.test(body.iv || '') || typeof body.data !== 'string' || !/^[\w-]+$/.test(body.data) || body.data.length > 3500000) return res.status(400).json({error:'Invalid encrypted workspace.'});
      const match = req.headers['if-match'];
      if (!match && req.headers['if-none-match'] !== '*') return res.status(428).json({error:'A revision is required.'});
      const result = await storage.put(path,JSON.stringify(body),{access:'private',addRandomSuffix:false,contentType:'application/json',...(match ? {ifMatch:match,allowOverwrite:true} : {allowOverwrite:false})});
      res.setHeader('ETag',result.etag);
      return res.status(200).json({ok:true});
    }
    res.setHeader('Allow','GET, PUT'); return res.status(405).end();
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError || /already exists/i.test(error.message)) return res.status(412).json({error:'Workspace changed; merge and retry.'});
    return res.status(503).json({error:'Sync storage is temporarily unavailable. Your local data is safe.'});
  }
}; }
export default createHandler();
