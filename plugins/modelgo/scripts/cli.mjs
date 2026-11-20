#!/usr/bin/env node
/**
 * ModelGo for WorkBuddy — command line.
 *
 *   node cli.mjs status [--verify]      where things stand; --verify asks the site (free)
 *   node cli.mjs set-key                type the key at a hidden prompt, in a terminal
 *   node cli.mjs models [--search x]    chat models the key can use
 *   node cli.mjs add <id>... | --all    put models into WorkBuddy's model list
 *   node cli.mjs sync                   refresh the models already added (key, limits, levels)
 *   node cli.mjs remove <id>... | --all take ModelGo models out again
 *   node cli.mjs clear-key              forget the saved key
 *
 * Every command prints one JSON object, so an agent can read the outcome; the
 * key itself is never printed, only a masked form. `set-key` is the one
 * interactive command: it reads the key from the terminal, never from an
 * argument, so the key does not end up in a chat transcript or shell history.
 *
 * Nothing here sends a model request. Listing models is free.
 */
import { entryFor } from '../lib/entries.mjs';
import { CONSOLE_URL, listChatModels, looksLikeKey, mask, redact, verifyKey } from '../lib/site.mjs';
import { clearKey, loadKey, modelsPath, ourModels, removeModels, saveKey, settingsPath, upsertModels } from '../lib/store.mjs';

const RESTART = 'Quit WorkBuddy completely (from the tray or menu bar, not just the window) and open it again; then pick the model under the input box.';
const NO_KEY = `No ModelGo key is saved. Run the "set-key" command in a terminal (create a key at ${CONSOLE_URL}).`;

const out = (value) => { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); };
const fail = (message, extra = {}) => { out({ ok: false, error: message, ...extra }); process.exitCode = 1; };

function requireKey() {
  const found = loadKey();
  if (!found.key) throw new Error(NO_KEY);
  return found.key;
}

/** Read one line from the terminal without echoing it. */
function promptHidden(question) {
  return new Promise((resolve, reject) => {
    const { stdin, stderr } = process;
    if (!stdin.isTTY) { reject(new Error('set-key must be run by a person in a terminal window. It does not accept a key as an argument or from a pipe.')); return; }
    stderr.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const done = (fn, arg) => { stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData); stderr.write('\n'); fn(arg); };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') { done(resolve, value); return; }
        if (ch === '\u0003') { done(reject, new Error('cancelled')); return; }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else if (ch >= ' ') value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

const commands = {
  async status(args) {
    const { key, source } = loadKey();
    let models = [];
    let modelsError;
    try { models = ourModels().map((m) => m.id); } catch (error) { modelsError = error.message; }
    const result = {
      ok: true,
      key: key ? { set: true, masked: mask(key), source } : { set: false },
      modelsFile: modelsPath(),
      added: models,
      ...(modelsError ? { modelsError } : {}),
      next: !key ? NO_KEY : !models.length ? 'Key is saved. Add models with the "add" command.' : 'Ready.',
    };
    if (args.includes('--verify') && key) {
      try { result.key.listed = await verifyKey(key); result.key.valid = true; }
      catch (error) { result.key.valid = false; result.key.problem = error.code === 'AUTH' ? 'The site did not accept this key.' : error.message; }
    }
    out(result);
  },

  async 'set-key'() {
    const value = (await promptHidden('Paste your ModelGo API key (starts with mgk_), then press Enter: ')).trim();
    if (!looksLikeKey(value)) throw new Error('That does not look like a ModelGo key: it starts with mgk_ and has no spaces. Nothing was saved.');
    let listed;
    try { listed = await verifyKey(value); }
    catch (error) { throw new Error(error.code === 'AUTH' ? 'The site did not accept this key. Nothing was saved.' : `Could not check the key (${error.message}). Nothing was saved.`); }
    saveKey(value);
    // Models already in WorkBuddy carry the key; bring them along.
    const existing = ourModels();
    const synced = existing.length ? upsertModels(existing.map((m) => ({ ...m, apiKey: value }))) : null;
    out({ ok: true, key: { masked: mask(value), listed }, settingsFile: settingsPath(), ...(synced ? { updatedModels: synced.updated, backup: synced.backup, restart: RESTART } : { next: 'Add models with the "add" command.' }) });
  },

  async 'clear-key'() {
    clearKey();
    out({ ok: true, note: 'The saved key was removed from this plugin\'s settings. Models already added to WorkBuddy still carry it; use "remove --all" to take them out too.' });
  },

  async models(args) {
    const key = requireKey();
    const i = args.indexOf('--search');
    const needle = i >= 0 ? String(args[i + 1] ?? '').toLowerCase() : '';
    const { models, notOnChat, unknown } = await listChatModels(key);
    const added = new Set(ourModels().map((m) => m.id));
    const rows = models.filter((m) => !needle || m.id.toLowerCase().includes(needle)).map((m) => {
      const e = entryFor(m, '');
      return { id: m.id, added: added.has(m.id), contextWindow: e.maxInputTokens, images: e.supportsImages, reasoning: e.reasoning?.supportedEfforts ?? [] };
    });
    out({ ok: true, count: rows.length, models: rows, ...(notOnChat.length ? { notUsableHere: notOnChat } : {}), ...(unknown.length ? { protocolsUnknown: unknown } : {}) });
  },

  async add(args) {
    const key = requireKey();
    const ids = args.filter((a) => !a.startsWith('--'));
    const all = args.includes('--all');
    if (!all && !ids.length) throw new Error('Name the models to add (ids from the "models" command), or pass --all.');
    const { models } = await listChatModels(key);
    const byId = new Map(models.map((m) => [m.id, m]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) throw new Error(`Not available to this key as chat models: ${missing.join(', ')}. Nothing was written.`);
    const chosen = all ? models : ids.map((id) => byId.get(id));
    const result = upsertModels(chosen.map((m) => entryFor(m, key)));
    out({ ok: true, ...result, restart: RESTART });
  },

  async sync() {
    const key = requireKey();
    const existing = ourModels();
    if (!existing.length) { out({ ok: true, updated: [], note: 'No ModelGo models are in WorkBuddy yet.' }); return; }
    const { models } = await listChatModels(key);
    const byId = new Map(models.map((m) => [m.id, m]));
    const gone = existing.filter((m) => !byId.has(m.id)).map((m) => m.id);
    const result = upsertModels(existing.filter((m) => byId.has(m.id)).map((m) => entryFor(byId.get(m.id), key)));
    out({ ok: true, ...result, ...(gone.length ? { noLongerOffered: gone, note: 'Models the site no longer offers to this key were left in place; remove them with "remove".' } : {}), restart: RESTART });
  },

  async remove(args) {
    const ids = args.filter((a) => !a.startsWith('--'));
    if (!args.includes('--all') && !ids.length) throw new Error('Name the models to remove, or pass --all.');
    const result = removeModels(args.includes('--all') ? 'all' : ids);
    out({ ok: true, ...result, ...(result.removed.length ? { restart: RESTART } : {}) });
  },
};

const [name, ...args] = process.argv.slice(2);
if (!name || !commands[name]) {
  out({ ok: false, error: `unknown command "${name ?? ''}"`, commands: Object.keys(commands) });
  process.exitCode = 2;
} else {
  try { await commands[name](args); }
  catch (error) { fail(redact(error?.message ?? String(error), loadKeySafely())); }
}

function loadKeySafely() { try { return loadKey().key; } catch { return ''; } }
