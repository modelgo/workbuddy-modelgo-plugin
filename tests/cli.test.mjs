import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { entryFor } from '../plugins/modelgo/lib/entries.mjs';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../plugins/modelgo/scripts/cli.mjs', import.meta.url));
const run = async (home, ...args) => {
  const env = { ...process.env, WORKBUDDY_HOME: home };
  delete env.MODELGO_API_KEY;
  const { stdout } = await exec(process.execPath, [cli, ...args], { env }).catch((error) => error);
  return JSON.parse(stdout);
};

// These commands touch no network: the CLI's site address is fixed and is never pointed at a test server.
test('status on a fresh machine says what to do next and shows no key', async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'wb-cli-'));
  try {
    const status = await run(home, 'status');
    assert.equal(status.ok, true);
    assert.deepEqual(status.key, { set: false });
    assert.deepEqual(status.added, []);
    assert.match(status.next, /settings page/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('status shows a saved key only in masked form', async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'wb-cli-'));
  try {
    writeFileSync(path.join(home, 'models.json'), JSON.stringify([entryFor({ id: 'gpt-5.6-luna' }, 'mgk_secret_value_abcd1234')]));
    const text = JSON.stringify(await run(home, 'status'));
    assert.doesNotMatch(text, /secret_value/);
    assert.match(text, /mgk_sec…1234/);
    assert.match(text, /gpt-5\.6-luna/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('set-key refuses to run without a terminal, so a key cannot be piped in from a chat', async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'wb-cli-'));
  try {
    const result = await run(home, 'set-key');
    assert.equal(result.ok, false);
    assert.match(result.error, /terminal/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('commands that need a key say so; remove works offline and leaves other models alone', async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'wb-cli-'));
  try {
    assert.match((await run(home, 'models')).error, /No ModelGo key/);
    const other = { id: 'kept', url: 'http://127.0.0.1:1/v1/chat/completions', apiKey: 'x' };
    writeFileSync(path.join(home, 'models.json'), JSON.stringify([other, entryFor({ id: 'gpt-5.6-luna' }, 'mgk_secret_value_abcd1234')]));
    const removed = await run(home, 'remove', '--all');
    assert.deepEqual(removed.removed, ['gpt-5.6-luna']);
    assert.deepEqual(JSON.parse(readFileSync(path.join(home, 'models.json'), 'utf8')), [other]);
    assert.equal((await run(home, 'nonsense')).ok, false);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
