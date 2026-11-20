import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startUi } from '../plugins/modelgo/lib/ui-server.mjs';

const KEY = 'mgk_page_key_000001';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
// A stand-in for the site: one accepted key, three chat models.
const site = async (url, init) => {
  assert.ok(String(url).startsWith('https://api.modelgo.ai/'));
  if (init.headers.authorization !== `Bearer ${KEY}`) return json({ error: { message: 'invalid api key' } }, 401);
  if (String(url).endsWith('/v1/models')) return json({ data: ['claude-sonnet-5.5', 'gpt-5.5', 'glm-5.3-flash'].map((id) => ({ id, context_length: 200000, input_modalities: ['text'], output_modalities: ['text'] })) });
  return json({ data: [{ code: 'openai_chat_completions' }] });
};

async function withUi(run) {
  const home = mkdtempSync(path.join(os.tmpdir(), 'wb-ui-'));
  const ui = await startUi({ env: { WORKBUDDY_HOME: home }, fetchImpl: site });
  const call = (method, route, body, headers = { 'x-modelgo-token': ui.token }) => fetch(ui.origin + route, { method, headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  try { await run({ home, ui, call }); } finally { await ui.close(); rmSync(home, { recursive: true, force: true }); }
}

test('the page saves a key the site accepts and refuses one it does not', async () => {
  await withUi(async ({ home, call }) => {
    assert.deepEqual((await (await call('GET', '/api/state')).json()).key, { set: false });
    const wrong = await call('POST', '/api/key', { key: 'mgk_wrong_key_000001' });
    assert.equal((await wrong.json()).code, 'AUTH');
    assert.equal((await (await call('POST', '/api/key', { key: 'not a key' })).json()).code, 'FORMAT');
    assert.deepEqual(readdirSync(home), []);
    assert.equal((await call('POST', '/api/key', { key: ` ${KEY} ` })).status, 200);
    const text = await (await call('GET', '/api/state')).text();
    // The page is told the key is there, never what it is.
    assert.doesNotMatch(text, /page_key/);
    const state = JSON.parse(text);
    assert.equal(state.key.set, true);
    assert.deepEqual(state.models.map((m) => [m.id, m.recommended]), [['claude-sonnet-5.5', true], ['gpt-5.5', false], ['glm-5.3-flash', false]]);
  });
});

test('saving makes the ModelGo models exactly the ticked ones and leaves other models alone', async () => {
  await withUi(async ({ home, call }) => {
    const mine = { id: 'my-own', url: 'http://127.0.0.1:1/v1/chat/completions', apiKey: 'x' };
    writeFileSync(path.join(home, 'models.json'), JSON.stringify([mine]));
    await call('POST', '/api/key', { key: KEY });
    const first = await (await call('POST', '/api/models', { ids: ['claude-sonnet-5.5', 'gpt-5.5'] })).json();
    assert.deepEqual(first.added, ['claude-sonnet-5.5', 'gpt-5.5']);
    const second = await (await call('POST', '/api/models', { ids: ['gpt-5.5', 'glm-5.3-flash'] })).json();
    assert.deepEqual([second.added, second.updated, second.removed], [['glm-5.3-flash'], ['gpt-5.5'], ['claude-sonnet-5.5']]);
    const saved = JSON.parse(readFileSync(path.join(home, 'models.json'), 'utf8'));
    assert.deepEqual(saved[0], mine);
    assert.deepEqual(saved.slice(1).map((m) => [m.id, m.name, m.apiKey]), [['gpt-5.5', 'ModelGo · gpt-5.5', KEY], ['glm-5.3-flash', 'ModelGo · glm-5.3-flash', KEY]]);
    assert.equal((await (await call('POST', '/api/models', { ids: ['made-up'] })).json()).code, 'UNKNOWN_MODEL');
    assert.equal((await (await call('POST', '/api/models', { ids: ['my-own'] })).json()).code, 'UNKNOWN_MODEL');
  });
});

test('nothing is read or changed without the token, or through another host name', async () => {
  await withUi(async ({ home, ui, call }) => {
    assert.equal((await call('GET', '/api/state', undefined, {})).status, 403);
    assert.equal((await call('POST', '/api/key', { key: KEY }, { 'x-modelgo-token': 'x'.repeat(ui.token.length) })).status, 403);
    assert.deepEqual(readdirSync(home), []);
    // A site that points its own name at 127.0.0.1 arrives with its own Host header.
    const status = await new Promise((resolve, reject) => {
      const { port } = new URL(ui.origin);
      http.get({ host: '127.0.0.1', port, path: '/api/state', headers: { host: `evil.example:${port}`, 'x-modelgo-token': ui.token } }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
    });
    assert.equal(status, 403);
    const page = await call('GET', '/', undefined, {});
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
    assert.doesNotMatch(await page.text(), new RegExp(ui.token));
  });
});
