import test from 'node:test';
import assert from 'node:assert/strict';
import { endpointsUrl, listChatModels, looksLikeKey, mask, parseModelList, redact } from '../plugins/modelgo/lib/site.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
// Shapes as the gateway returns them.
const item = (id, output = ['text']) => ({ id, object: 'model', context_length: 200000, input_modalities: ['text', 'image'], output_modalities: output });

test('key helpers never expose a key', () => {
  assert.equal(looksLikeKey('mgk_abcdefgh1234'), true);
  assert.equal(looksLikeKey('sk-abcdefgh1234'), false);
  assert.equal(looksLikeKey('mgk_with space'), false);
  assert.equal(mask('mgk_abcdefghijklmnop1234'), 'mgk_abc…1234');
  assert.equal(redact('bad key mgk_abcdefgh1234 here'), 'bad key mgk_<redacted> here');
});

test('parseModelList keeps what the site publishes', () => {
  const [a] = parseModelList({ data: [item('gpt-5'), item('gpt-5'), { id: '' }] });
  assert.deepEqual(a, { id: 'gpt-5', contextWindow: 200000, maxTokens: undefined, protocols: undefined, input: ['text', 'image'], output: ['text'] });
});

test('endpointsUrl uses the query form for ids with a slash', () => {
  assert.equal(endpointsUrl('gpt-5'), 'https://api.modelgo.ai/v1/models/gpt-5/endpoints');
  assert.equal(endpointsUrl('a/b'), 'https://api.modelgo.ai/v1/models/endpoints?model=a%2Fb');
});

test('only models the site offers on Chat Completions are listed, and the key goes only to ModelGo', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), auth: init.headers.authorization, redirect: init.redirect });
    if (String(url).endsWith('/v1/models')) return json({ data: [item('gpt-5'), item('jev-1'), item('seedream', ['image']), item('flaky')] });
    if (String(url).includes('jev-1')) return json({ data: [{ code: 'typesafe_systemone' }] });
    if (String(url).includes('flaky')) return json({ error: { message: 'busy' } }, 429);
    return json({ data: [{ code: 'openai_chat_completions' }, { code: 'anthropic_messages' }] });
  };
  const result = await listChatModels('mgk_list_key_0001', { fetchImpl });
  assert.deepEqual(result.models.map((m) => m.id), ['gpt-5']);
  assert.deepEqual(result.notOnChat, ['jev-1']);
  assert.deepEqual(result.unknown, ['flaky']);
  assert.ok(calls.every((c) => c.url.startsWith('https://api.modelgo.ai/') && c.auth === 'Bearer mgk_list_key_0001' && c.redirect === 'manual'));
  assert.ok(!calls.some((c) => c.url.includes('seedream')), 'an image model is never asked about');
});

test('a rejected key is reported as such, without the key in the message', async () => {
  await assert.rejects(listChatModels('mgk_bad_key_000001', { fetchImpl: async () => json({ error: { message: 'no such key mgk_bad_key_000001' } }, 401) }), (error) => {
    assert.equal(error.code, 'AUTH');
    assert.doesNotMatch(error.message, /bad_key/);
    return true;
  });
});
