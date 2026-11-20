/**
 * The settings page: a small web server on this computer only.
 *
 * `ui` opens a page in the browser where the key is pasted and models are
 * ticked, so nothing has to be typed into a terminal or a chat. The server
 * listens on 127.0.0.1, on a port the system picks, and stops by itself.
 *
 * Every request that reads or changes anything must carry a random token made
 * when the server starts. The token travels in the page address after `#`, a
 * part browsers never send over the network, so another site open in the same
 * browser cannot learn it and cannot act on the user's key or model list.
 */
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { entryFor, recommended } from './entries.mjs';
import { CONSOLE_URL, listChatModels, looksLikeKey, mask, redact, verifyKey } from './site.mjs';
import { loadKey, modelsPath, ourModels, removeModels, saveKey, upsertModels } from './store.mjs';

const STATIC = {
  '/': ['../ui/index.html', 'text/html; charset=utf-8'],
  '/app.js': ['../ui/app.js', 'text/javascript; charset=utf-8'],
  '/icon.png': ['../icon.png', 'image/png'],
};
const MAX_BODY = 64 * 1024;
const HEADERS = {
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

class Refusal extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new Refusal('TOO_LARGE', 'request too large', 413)); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new Refusal('BAD_JSON', 'request is not JSON')); }
    });
    req.on('error', reject);
  });
}

/** What the page shows: the key in masked form, and each model the key can use. */
async function state({ env, fetchImpl }) {
  const { key } = loadKey(env);
  const path = modelsPath(env);
  const added = ourModels(path).map((m) => m.id);
  if (!key) return { key: { set: false }, models: [], added, console: CONSOLE_URL };
  const options = fetchImpl ? { fetchImpl } : {};
  const { models } = await listChatModels(key, options);
  const suggested = recommended();
  const offered = new Set(models.map((m) => m.id));
  return {
    key: { set: true, masked: mask(key) },
    models: models.map((m) => {
      const e = entryFor(m, '');
      return { id: m.id, recommended: suggested.includes(m.id), contextWindow: e.maxInputTokens, images: e.supportsImages, reasoning: e.reasoning?.supportedEfforts ?? [] };
    }),
    added,
    // Added earlier, no longer offered to this key: shown so they can be unticked.
    gone: added.filter((id) => !offered.has(id)),
    console: CONSOLE_URL,
  };
}

async function setKey(body, { env, fetchImpl }) {
  const value = typeof body.key === 'string' ? body.key.trim() : '';
  if (!looksLikeKey(value)) throw new Refusal('FORMAT', 'not a ModelGo key');
  try { await verifyKey(value, fetchImpl ? { fetchImpl } : {}); }
  catch (error) { throw new Refusal(error.code === 'AUTH' ? 'AUTH' : 'UNREACHABLE', redact(error.message, value), error.code === 'AUTH' ? 400 : 502); }
  saveKey(value, env);
  // Models already in WorkBuddy carry the key; bring them along.
  const path = modelsPath(env);
  const existing = ourModels(path);
  if (existing.length) upsertModels(existing.map((m) => ({ ...m, apiKey: value })), path);
  return { ok: true };
}

/** Make WorkBuddy's ModelGo models exactly the ticked ones. */
async function setModels(body, { env, fetchImpl }) {
  if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== 'string')) throw new Refusal('BAD_REQUEST', 'ids must be a list of model ids');
  const { key } = loadKey(env);
  if (!key) throw new Refusal('NO_KEY', 'no key is saved');
  const wanted = new Set(body.ids);
  const path = modelsPath(env);
  const { models } = await listChatModels(key, fetchImpl ? { fetchImpl } : {});
  const offered = new Map(models.map((m) => [m.id, m]));
  const current = ourModels(path).map((m) => m.id);
  // A ticked model the key can no longer use is left as it is; an unknown id is refused.
  const unknown = [...wanted].filter((id) => !offered.has(id) && !current.includes(id));
  if (unknown.length) throw new Refusal('UNKNOWN_MODEL', `not available to this key: ${unknown.join(', ')}`);
  const upsert = [...wanted].filter((id) => offered.has(id)).map((id) => entryFor(offered.get(id), key));
  const drop = current.filter((id) => !wanted.has(id));
  let written = { added: [], updated: [], backup: null };
  try { if (upsert.length) written = upsertModels(upsert, path); }
  catch (error) { throw new Refusal('CONFLICT', error.message, 409); }
  const removed = drop.length ? removeModels(drop, path) : { removed: [], backup: null };
  return { ok: true, added: written.added, updated: written.updated, removed: removed.removed, file: path, backup: written.backup ?? removed.backup };
}

const ROUTES = {
  'GET /api/state': (_body, ctx) => state(ctx),
  'POST /api/key': setKey,
  'POST /api/models': setModels,
};

/**
 * Start the settings page.
 * @returns the address to open (token included), and `close`.
 */
export async function startUi({ env = process.env, fetchImpl, idleMs = 15 * 60_000, onClose } = {}) {
  const token = randomBytes(24).toString('base64url');
  const expected = Buffer.from(token);
  let origin = '';
  let timer;
  const server = createServer(async (req, res) => {
    const send = (status, body, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, { ...HEADERS, 'content-type': type });
      res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    };
    try {
      // The address the browser used must be ours: a site that points its own name at 127.0.0.1 is turned away.
      if (`http://${req.headers.host}` !== origin) throw new Refusal('FORBIDDEN', 'forbidden', 403);
      const url = new URL(req.url, origin);
      const file = req.method === 'GET' ? STATIC[url.pathname] : undefined;
      if (file) { send(200, readFileSync(new URL(file[0], import.meta.url)), file[1]); return; }
      const route = ROUTES[`${req.method} ${url.pathname}`];
      if (!route) throw new Refusal('NOT_FOUND', 'not found', 404);
      const given = Buffer.from(String(req.headers['x-modelgo-token'] ?? ''));
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Refusal('FORBIDDEN', 'forbidden', 403);
      if (req.method === 'POST' && !String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new Refusal('BAD_REQUEST', 'send JSON', 415);
      restartTimer();
      send(200, await route(req.method === 'POST' ? await readBody(req) : {}, { env, fetchImpl }));
    } catch (error) {
      const refusal = error instanceof Refusal;
      const code = refusal ? error.code : error?.code === 'AUTH' ? 'AUTH' : error?.name === 'SiteError' ? 'UNREACHABLE' : 'FAILED';
      send(refusal ? error.status : code === 'FAILED' ? 500 : 502, { ok: false, code, error: redact(error?.message ?? String(error), loadKeyQuietly(env)) });
    }
  });
  const close = () => new Promise((resolve) => { clearTimeout(timer); server.close(() => resolve()); server.closeAllConnections?.(); });
  function restartTimer() {
    clearTimeout(timer);
    timer = setTimeout(() => { close().then(() => onClose?.()); }, idleMs);
    timer.unref?.();
  }
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  restartTimer();
  return { url: `${origin}/#${token}`, origin, token, close };
}

function loadKeyQuietly(env) { try { return loadKey(env).key; } catch { return ''; } }
