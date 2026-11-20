import test from 'node:test';
import assert from 'node:assert/strict';
import { entryFor, isOurs, pickRecommended, probed, profiles, reasoningFor, recommended } from '../plugins/modelgo/lib/entries.mjs';
import { CHAT_URL } from '../plugins/modelgo/lib/site.mjs';

test('an entry carries the fields WorkBuddy documents, with limits from the site', () => {
  const entry = entryFor({ id: 'gpt-5.6-luna', contextWindow: 1050000, input: ['text', 'image'] }, 'mgk_test_key_0001');
  assert.deepEqual(Object.keys(entry), ['id', 'name', 'vendor', 'url', 'apiKey', 'maxInputTokens', 'maxOutputTokens', 'supportsToolCall', 'supportsImages', 'supportsReasoning', 'reasoning']);
  assert.equal(entry.url, 'https://api.modelgo.ai/v1/chat/completions');
  assert.equal(entry.vendor, 'ModelGo');
  // The id is what is sent to the site; the name is only what the picker shows.
  assert.equal(entry.id, 'gpt-5.6-luna');
  assert.equal(entry.name, 'ModelGo · gpt-5.6-luna');
  assert.equal(entry.maxInputTokens, 1050000);
  assert.equal(entry.supportsImages, true);
  assert.equal(entry.supportsToolCall, true);
  assert.deepEqual(entry.reasoning.supportedEfforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(entry.reasoning.defaultEffort, 'medium');
  assert.equal(entry.reasoning.canDisableThinking, true);
});

test('levels a model does not have are not offered', () => {
  // gpt-5.5 has no max; gpt-6.2-sol cannot turn thinking off.
  assert.deepEqual(entryFor({ id: 'gpt-5.5' }, 'k').reasoning.supportedEfforts, ['low', 'medium', 'high', 'xhigh']);
  assert.equal(entryFor({ id: 'gpt-6.2-sol' }, 'k').reasoning.canDisableThinking, false);
  // deepseek-v4.1-flash has high and max only.
  const deepseek = entryFor({ id: 'deepseek-v4.1-flash' }, 'k').reasoning;
  assert.deepEqual(deepseek.supportedEfforts, ['high', 'max']);
  assert.equal(deepseek.defaultEffort, 'high');
});

test('a model with no profile is entered plain, never with guessed levels', () => {
  const entry = entryFor({ id: 'brand-new-model', input: ['text'] }, 'k');
  assert.equal(entry.supportsReasoning, false);
  assert.equal('reasoning' in entry, false);
  assert.equal(entry.supportsImages, false);
  assert.equal(entry.maxInputTokens, 128000);
  assert.equal(entry.maxOutputTokens, 32768);
});

test('a limit the site sets lower than the vendor is applied', () => {
  assert.equal(entryFor({ id: 'claude-sonnet-4.6' }, 'k').maxOutputTokens, 64000);
  assert.equal(entryFor({ id: 'claude-sonnet-5' }, 'k').maxOutputTokens, 128000);
});

test('reasoningFor', () => {
  assert.equal(reasoningFor(undefined), undefined);
  assert.equal(reasoningFor({ reasoning: false }), undefined);
  assert.deepEqual(reasoningFor({ reasoning: true }), { supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium', canDisableThinking: true });
  assert.deepEqual(reasoningFor({ reasoning: true, thinkingLevelMap: { medium: null } }).supportedEfforts, ['low', 'high']);
  assert.equal(reasoningFor({ reasoning: true, thinkingLevelMap: { low: null, medium: null, high: null, xhigh: null, max: null } }), undefined);
});

test('the two top levels exist only where a profile names them', () => {
  assert.deepEqual(reasoningFor({ reasoning: true, thinkingLevelMap: { max: 'max' } }).supportedEfforts, ['low', 'medium', 'high', 'max']);
  assert.deepEqual(reasoningFor({ reasoning: true, thinkingLevelMap: { low: null, medium: null, high: 'high', max: 'max' } }).supportedEfforts, ['high', 'max']);
});

test('only entries pointing at the ModelGo endpoint count as ours', () => {
  assert.equal(isOurs({ id: 'x', url: CHAT_URL }), true);
  assert.equal(isOurs({ id: 'x', url: 'http://127.0.0.1:3425/v1/chat/completions', vendor: 'ModelGo' }), false);
  assert.equal(isOurs({ id: 'x' }), false);
});

test('the shipped profiles load', () => {
  assert.ok(Object.keys(profiles().models).length > 70);
});

test('a level the site refused when probed is not offered, whatever the profile says', () => {
  const profile = { reasoning: true, thinkingLevelMap: { xhigh: 'xhigh' } };
  assert.deepEqual(reasoningFor(profile, { efforts: ['low', 'high', 'xhigh'], canDisableThinking: false }), { supportedEfforts: ['low', 'high', 'xhigh'], defaultEffort: 'high', canDisableThinking: false });
  // The probe never adds a level the profile does not name.
  assert.deepEqual(reasoningFor({ reasoning: true }, { efforts: ['low', 'medium', 'high', 'xhigh', 'max'], canDisableThinking: true }).supportedEfforts, ['low', 'medium', 'high']);
  // Shipped data: glm-5.3-flash refuses medium on this wire.
  assert.deepEqual(entryFor({ id: 'glm-5.3-flash' }, 'k').reasoning.supportedEfforts, ['low', 'high']);
});

test('the recommended set is short, and every model in it is one the site offered when probed', () => {
  const list = recommended();
  assert.ok(list.length >= 4 && list.length <= 10);
  assert.equal(new Set(list).size, list.length);
  for (const id of list) assert.ok(probed()[id], id);
});

test('recommended models a key cannot use are reported, not added', () => {
  const { chosen, unavailable } = pickRecommended([{ id: 'b' }, { id: 'a' }, { id: 'other' }], ['a', 'b', 'c']);
  assert.deepEqual(chosen.map((m) => m.id), ['a', 'b']);
  assert.deepEqual(unavailable, ['c']);
});
