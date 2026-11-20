import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { entryFor } from '../plugins/modelgo/lib/entries.mjs';
import { loadKey, modelsPath, ourModels, readModels, removeModels, saveKey, settingsPath, upsertModels } from '../plugins/modelgo/lib/store.mjs';

const home = () => mkdtempSync(path.join(os.tmpdir(), 'wb-modelgo-'));
const foreign = { id: 'modelgo-ai/gpt-5.6-luna', name: 'via a local proxy', vendor: 'magpie', url: 'http://127.0.0.1:3425/v1/chat/completions', apiKey: 'local-secret' };

test('adding keeps every other model exactly as it was, and backs the file up first', () => {
  const dir = home();
  try {
    const file = path.join(dir, 'models.json');
    writeFileSync(file, JSON.stringify([foreign]));
    const result = upsertModels([entryFor({ id: 'gpt-5.6-luna' }, 'mgk_k1')], file);
    assert.deepEqual(result.added, ['gpt-5.6-luna']);
    const after = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(after[0], foreign);
    assert.equal(after[1].id, 'gpt-5.6-luna');
    assert.deepEqual(JSON.parse(readFileSync(result.backup, 'utf8')), [foreign]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an id used by a model that is not ours is refused, and nothing is written', () => {
  const dir = home();
  try {
    const file = path.join(dir, 'models.json');
    const taken = { id: 'gpt-5.6-luna', url: 'https://elsewhere.example/v1/chat/completions', apiKey: 'x' };
    writeFileSync(file, JSON.stringify([taken]));
    assert.throws(() => upsertModels([entryFor({ id: 'gpt-5.6-luna' }, 'mgk_k1')], file), /already used/);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), [taken]);
    assert.equal(readdirSync(dir).length, 1, 'no backup, because nothing changed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('updating replaces in place; removing touches only our entries', () => {
  const dir = home();
  try {
    const file = path.join(dir, 'models.json');
    writeFileSync(file, JSON.stringify([foreign]));
    upsertModels([entryFor({ id: 'a' }, 'mgk_old'), entryFor({ id: 'b' }, 'mgk_old')], file);
    const again = upsertModels([entryFor({ id: 'a' }, 'mgk_new')], file);
    assert.deepEqual([again.added, again.updated], [[], ['a']]);
    assert.deepEqual(ourModels(file).map((m) => [m.id, m.apiKey]), [['a', 'mgk_new'], ['b', 'mgk_old']]);
    assert.deepEqual(removeModels(['a', foreign.id], file).removed, ['a']);
    assert.deepEqual(removeModels('all', file).removed, ['b']);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), [foreign]);
    assert.equal(removeModels('all', file).backup, null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the documented object layout is kept, and availableModels follows what we add and remove', () => {
  const dir = home();
  try {
    const file = path.join(dir, 'models.json');
    writeFileSync(file, JSON.stringify({ models: [foreign], availableModels: [foreign.id], note: 'keep me' }));
    upsertModels([entryFor({ id: 'gpt-5.6-luna' }, 'mgk_k1')], file);
    let doc = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(doc.note, 'keep me');
    assert.deepEqual(doc.availableModels, [foreign.id, 'gpt-5.6-luna']);
    removeModels('all', file);
    doc = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(doc.availableModels, [foreign.id]);
    assert.deepEqual(doc.models, [foreign]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a missing file reads as empty; an unknown layout is refused', () => {
  const dir = home();
  try {
    assert.deepEqual(readModels(path.join(dir, 'models.json')).models, []);
    writeFileSync(path.join(dir, 'odd.json'), '"just a string"');
    assert.throws(() => readModels(path.join(dir, 'odd.json')), /does not recognise/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the key is saved in a file only its owner can read, and found again', { skip: process.platform === 'win32' && 'file modes do not apply on Windows' }, () => {
  const dir = home();
  try {
    const env = { WORKBUDDY_HOME: dir };
    assert.deepEqual(loadKey(env), { key: '', source: 'none' });
    saveKey('mgk_saved_key_0001', env);
    assert.equal(statSync(settingsPath(env)).mode & 0o777, 0o600);
    assert.deepEqual(loadKey(env), { key: 'mgk_saved_key_0001', source: 'settings' });
    assert.equal(modelsPath(env), path.join(dir, 'models.json'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
