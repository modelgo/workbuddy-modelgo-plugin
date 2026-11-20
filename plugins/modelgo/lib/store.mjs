/**
 * Local files: WorkBuddy's `models.json` and this plugin's own settings.
 *
 * `models.json` belongs to the user and to WorkBuddy. This module only ever
 * adds, replaces or removes entries this plugin wrote (see `isOurs`), keeps
 * everything else byte-for-byte in place, and copies the file aside before
 * every write.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { isOurs } from './entries.mjs';

export const workbuddyDir = (env = process.env) => env.WORKBUDDY_HOME || join(homedir(), '.workbuddy');
export const modelsPath = (env = process.env) => join(workbuddyDir(env), 'models.json');
export const settingsPath = (env = process.env) => join(workbuddyDir(env), 'modelgo', 'settings.json');

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  const raw = readFileSync(path, 'utf8').replace(/^﻿/, '').trim();
  return raw ? JSON.parse(raw) : fallback;
}

function writeJson(path, value, mode) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', ...(mode ? { mode } : {}) });
  renameSync(tmp, path);
  if (mode) chmodSync(path, mode);
}

/** Read `models.json`. WorkBuddy accepts a bare array and `{ models: [...] }`; both are kept as found. */
export function readModels(path = modelsPath()) {
  const data = readJson(path, []);
  if (Array.isArray(data)) return { layout: 'array', models: data, raw: data };
  if (data && typeof data === 'object' && (data.models === undefined || Array.isArray(data.models))) return { layout: 'object', models: data.models ?? [], raw: data };
  throw new Error('models.json is in a layout this plugin does not recognise; nothing was written.');
}

function writeModels(path, { layout, raw }, models) {
  let backup = null;
  if (existsSync(path)) {
    backup = `${path}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    copyFileSync(path, backup);
  }
  if (layout === 'array') {
    writeJson(path, models);
    return backup;
  }
  const next = { ...raw, models };
  // An `availableModels` list restricts the picker; keep ours in step with what we add and remove.
  if (Array.isArray(raw.availableModels)) {
    const before = new Set(raw.models?.filter(isOurs).map((m) => m.id));
    const after = models.filter(isOurs).map((m) => m.id);
    next.availableModels = [...raw.availableModels.filter((id) => !before.has(id)), ...after];
  }
  writeJson(path, next);
  return backup;
}

/** The entries this plugin wrote. */
export const ourModels = (path = modelsPath()) => readModels(path).models.filter(isOurs);

/**
 * Add or replace entries. An id already used by an entry that is not ours is
 * refused: this plugin does not overwrite a model the user set up another way.
 */
export function upsertModels(entries, path = modelsPath()) {
  const state = readModels(path);
  const conflicts = entries.filter((e) => state.models.some((m) => m?.id === e.id && !isOurs(m))).map((e) => e.id);
  if (conflicts.length) throw new Error(`these ids are already used by models that are not ModelGo's, and were left alone: ${conflicts.join(', ')}`);
  const incoming = new Map(entries.map((e) => [e.id, e]));
  // Replace in place so the user's ordering survives; append what is new.
  const merged = state.models.map((m) => (isOurs(m) && incoming.has(m.id) ? incoming.get(m.id) : m));
  const present = new Set(state.models.filter(isOurs).map((m) => m.id));
  merged.push(...entries.filter((e) => !present.has(e.id)));
  const backup = writeModels(path, state, merged);
  return { path, backup, added: entries.filter((e) => !present.has(e.id)).map((e) => e.id), updated: entries.filter((e) => present.has(e.id)).map((e) => e.id) };
}

/** Remove entries this plugin wrote: the given ids, or all of them. */
export function removeModels(ids, path = modelsPath()) {
  const state = readModels(path);
  const target = ids === 'all' ? undefined : new Set(ids);
  const removed = state.models.filter((m) => isOurs(m) && (!target || target.has(m.id))).map((m) => m.id);
  if (!removed.length) return { path, backup: null, removed };
  const gone = new Set(removed);
  const backup = writeModels(path, state, state.models.filter((m) => !(isOurs(m) && gone.has(m.id))));
  return { path, backup, removed };
}

/** The saved key, if any. The settings file is readable by its owner only. */
export function loadKey(env = process.env) {
  const fromEnv = env.MODELGO_API_KEY?.trim();
  if (fromEnv) return { key: fromEnv, source: 'environment' };
  const saved = readJson(settingsPath(env), {}).apiKey;
  if (typeof saved === 'string' && saved.trim()) return { key: saved.trim(), source: 'settings' };
  // Models imported before a settings file existed still carry the key.
  try {
    const keys = [...new Set(ourModels(modelsPath(env)).map((m) => m.apiKey).filter((k) => typeof k === 'string' && k.trim()))];
    if (keys.length === 1) return { key: keys[0].trim(), source: 'models.json' };
  } catch { /* unreadable models.json: no key from there */ }
  return { key: '', source: 'none' };
}

export function saveKey(key, env = process.env) {
  writeJson(settingsPath(env), { ...readJson(settingsPath(env), {}), apiKey: key }, 0o600);
}

export function clearKey(env = process.env) {
  if (!existsSync(settingsPath(env))) return;
  const { apiKey: _dropped, ...rest } = readJson(settingsPath(env), {});
  writeJson(settingsPath(env), rest, 0o600);
}
