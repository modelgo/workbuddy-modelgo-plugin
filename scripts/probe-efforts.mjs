#!/usr/bin/env node
/**
 * Maintainer tool: find out which `reasoning_effort` values the site accepts
 * for each chat model over Chat Completions — the wire WorkBuddy uses.
 *
 *   MODELGO_API_KEY=... node scripts/probe-efforts.mjs            # every chat model
 *   MODELGO_API_KEY=... node scripts/probe-efforts.mjs gpt-5.5    # only these
 *
 * For each model it sends one tiny request per value (low, medium, high, xhigh,
 * max, and "none" for switching thinking off) and records which were accepted.
 * A value the site refuses with a 400 must not be offered in WorkBuddy's
 * picker. Results are written to plugins/modelgo/data/efforts.json.
 *
 * These are real, billed requests: one short prompt each, about six per model.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { CHAT_URL, listChatModels } from '../plugins/modelgo/lib/site.mjs';

const key = process.env.MODELGO_API_KEY;
if (!key) { console.error('set MODELGO_API_KEY'); process.exit(2); }
const VALUES = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
const target = new URL('../plugins/modelgo/data/efforts.json', import.meta.url);
const only = process.argv.slice(2);

async function probe(model, effort) {
  const body = { model, max_tokens: 1024, messages: [{ role: 'user', content: 'Reply with the single word: ok' }], reasoning_effort: effort };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(CHAT_URL, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
      if (res.ok) { await res.arrayBuffer(); return 'ok'; }
      const text = await res.text();
      if (res.status === 400) return 'refused';
      if (res.status === 402) return 'budget';
      if (attempt === 1) return `error ${res.status} ${text.slice(0, 80)}`;
    } catch (error) { if (attempt === 1) return `error ${error.message}`; }
  }
  return 'error';
}

const { models } = await listChatModels(key);
const ids = models.map((m) => m.id).filter((id) => !only.length || only.includes(id));
let saved = {};
try { saved = JSON.parse(readFileSync(target, 'utf8')).models ?? {}; } catch { /* first run */ }
const queue = ids.flatMap((id) => VALUES.map((effort) => ({ id, effort })));
const outcome = new Map(ids.map((id) => [id, {}]));
await Promise.all(Array.from({ length: 6 }, async () => {
  for (let job = queue.shift(); job; job = queue.shift()) outcome.get(job.id)[job.effort] = await probe(job.id, job.effort);
}));
for (const [id, results] of outcome) {
  const unsure = Object.entries(results).filter(([, r]) => r !== 'ok' && r !== 'refused');
  console.log(`${id.padEnd(26)} ${VALUES.map((v) => `${v}:${results[v] === 'ok' ? 'Y' : results[v] === 'refused' ? 'x' : '?'}`).join(' ')}${unsure.length ? `   ${unsure.map(([v, r]) => `${v}=${r}`).join('; ')}` : ''}`);
  // An inconclusive probe never overwrites what an earlier run established.
  if (unsure.length) continue;
  saved[id] = { efforts: VALUES.filter((v) => v !== 'none' && results[v] === 'ok'), canDisableThinking: results.none === 'ok' };
}
writeFileSync(target, `${JSON.stringify({ wire: 'openai_chat_completions reasoning_effort', probed: new Date().toISOString().slice(0, 10), models: Object.fromEntries(Object.entries(saved).sort(([a], [b]) => (a < b ? -1 : 1))) }, null, 2)}\n`);
console.log(`wrote ${Object.keys(saved).length} models`);
