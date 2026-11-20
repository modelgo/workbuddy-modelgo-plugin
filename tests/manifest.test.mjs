import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const market = JSON.parse(read('.codebuddy-plugin/marketplace.json'));
const plugin = JSON.parse(read('plugins/modelgo/.codebuddy-plugin/plugin.json'));
const pkg = JSON.parse(read('package.json'));

test('the marketplace lists the plugin at the path where it lives', () => {
  assert.equal(market.name, 'modelgo');
  const [entry] = market.plugins;
  assert.equal(entry.name, plugin.name);
  assert.ok(existsSync(new URL(`../${entry.source}/.codebuddy-plugin/plugin.json`, import.meta.url)));
});

test('one version everywhere', () => {
  assert.equal(market.plugins[0].version, plugin.version);
  assert.equal(pkg.version, plugin.version);
});

test('the skill and everything it points at are in the plugin', () => {
  const skill = read('plugins/modelgo/skills/modelgo/SKILL.md');
  assert.match(skill, /^---\nname: modelgo\n/);
  for (const file of ['plugins/modelgo/scripts/cli.mjs', 'plugins/modelgo/extras/打开设置.command', 'plugins/modelgo/extras/打开设置.bat', 'plugins/modelgo/ui/index.html', 'plugins/modelgo/ui/app.js', 'plugins/modelgo/data/model-profiles.json']) {
    assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), file);
  }
});

test('the skill tells the agent to keep the key out of the chat', () => {
  assert.match(read('plugins/modelgo/skills/modelgo/SKILL.md'), /密钥不进聊天/);
});
