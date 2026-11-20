import { createHash, timingSafeEqual } from 'node:crypto';
import { get, put, BlobPreconditionFailedError } from '@vercel/blob';
const path = 'journal-index/private-workspace-v1.json';
const clipId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const encrypted = (body, limit) => body?.version === 1 && /^[\w-]{16}$/.test(body.iv || '') && typeof body.data === 'string' && body.data.length <= limit && /^[\w-]+$/.test(body.data);
async function handleClip(req, res, storage, id, part = null) {
  if (!clipId.test(id) || (part !== null && (!/^(0|[1-9][0-9]?)$/.test(part) || Number(part) >= 29))) return res.status(400).json({ error: 'Invalid recording.' });
  const key = part === null ? `journal-index/voice-v1/${id}.json` : `journal-index/media-v1/${id}/${part}.json`;
  const options = { access: 'private', abortSignal: AbortSignal.timeout(15000) };
  if (req.method === 'GET') {
    const result = await storage.get(key, { ...options, useCache: false });
    if (!result) return res.status(404).json({ error: 'Voice clip is unavailable.' });
    return res.status(200).json(JSON.parse(await new Response(result.stream).text()));
  }
  if (req.method === 'PUT') {
    if (!encrypted(req.body, part === null ? 2000050 : 3733370)) return res.status(400).json({ error: 'Invalid encrypted recording.' });
    await storage.put(key, JSON.stringify(req.body), { ...options, addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json' });
    return res.status(200).json({ ok: true });
  }
  res.setHeader('Allow', 'GET, PUT'); return res.status(405).end();
}
export function createHandler(storage = { get, put }) { return async function handler(req, res) {
  res.setHeader('Cache-Control','no-store, no-transform');
  res.setHeader('X-Content-Type-Options','nosniff');
  const expected = process.env.SYNC_WORKSPACE_ID || '';
  if (!expected || !process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({error:'Private sync is not configured yet. Local saving is available.'});
  const auth = req.headers.authorization?.match(/^Bearer ([\w-]{43})$/)?.[1];
  const actual = auth ? createHash('sha256').update(auth).digest('base64url') : '';
  if (actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual),Buffer.from(expected))) return res.status(401).json({error:'This pairing code does not match this private workspace.'});
  try {
    const query = new URL(req.url || '/', 'https://journal.invalid').searchParams;
    const media = query.get('media');
    if (media !== null) return await handleClip(req, res, storage, media, query.get('part') ?? '');
    const clip = query.get('voice');
    if (clip !== null) return await handleClip(req, res, storage, clip);
    if (req.method === 'GET') {
      const result = await storage.get(path,{access:'private',useCache:false,abortSignal:AbortSignal.timeout(15000),ifNoneMatch:req.headers['if-none-match']});
      if (!result) return res.status(404).json({error:'Workspace has not been uploaded yet.'});
      res.setHeader('ETag',result.blob.etag);
      res.setHeader('X-Workspace-Revision',result.blob.etag.replace(/^W\//,''));
      if (result.statusCode === 304) return res.status(304).end();
      return res.status(200).json(JSON.parse(await new Response(result.stream).text()));
    }
    if (req.method === 'PUT') {
      const body = req.body;
      if (!encrypted(body, 3500000)) return res.status(400).json({error:'Invalid encrypted workspace.'});
      const match = req.headers['if-match'];
      if (!match && req.headers['if-none-match'] !== '*') return res.status(428).json({error:'A revision is required.'});
      const result = await storage.put(path,JSON.stringify(body),{access:'private',abortSignal:AbortSignal.timeout(15000),addRandomSuffix:false,contentType:'application/json',...(match ? {ifMatch:match,allowOverwrite:true} : {allowOverwrite:false})});
      res.setHeader('ETag',result.etag);
      res.setHeader('X-Workspace-Revision',result.etag.replace(/^W\//,''));
      return res.status(200).json({ok:true});
    }
    res.setHeader('Allow','GET, PUT'); return res.status(405).end();
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError || /already exists/i.test(error.message)) return res.status(412).json({error:'Workspace changed; merge and retry.'});
    return res.status(503).json({error:'Sync storage is temporarily unavailable. Your local data is safe.'});
  }
}; }
export default createHandler();
