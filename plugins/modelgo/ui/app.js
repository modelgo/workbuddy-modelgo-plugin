// The settings page. It talks only to the local server that served it.
(() => {
  const zh = (navigator.language || '').toLowerCase().startsWith('zh');
  const T = zh ? {
    subtitle: '把 ModelGo 的模型加入 WorkBuddy',
    keyTitle: 'API 密钥',
    keySavedAs: '已保存',
    keyChange: '更换',
    keySave: '验证并保存',
    keyHint: '密钥以 mgk_ 开头，在控制台创建：',
    modelsTitle: '选择模型',
    search: '搜索模型',
    save: '保存到 WorkBuddy',
    recommended: '推荐',
    all: '全部模型',
    pickAll: '全选',
    pickNone: '全不选',
    images: '读图',
    reasoning: '思考',
    gone: '已不可用',
    count: (n) => `已选 ${n} 个`,
    working: '处理中…',
    keyOk: '密钥已保存。',
    saved: (r) => `已保存：新增 ${r.added.length}，更新 ${r.updated.length}，移除 ${r.removed.length}。回到 WorkBuddy，在输入框下方的模型选择里就能看到；没有出现的话，彻底退出 WorkBuddy 再打开。`,
    noMatch: '没有匹配的模型',
    expired: '这个页面已失效。回到 WorkBuddy 说“打开 ModelGo 设置”重新打开。',
    errors: {
      FORMAT: '这不像 ModelGo 的密钥：应以 mgk_ 开头，且没有空格。',
      AUTH: 'ModelGo 没有接受这把密钥，请检查是否复制完整，或是否已被删除。',
      UNREACHABLE: '连不上 ModelGo，请检查网络后重试。',
      NO_KEY: '请先保存密钥。',
      CONFLICT: '有同名模型是用别的方式配置的，没有覆盖它。请取消勾选后重试：',
      FAILED: '出错了：',
    },
  } : {
    subtitle: 'Add ModelGo models to WorkBuddy',
    keyTitle: 'API key',
    keySavedAs: 'Saved',
    keyChange: 'Change',
    keySave: 'Verify and save',
    keyHint: 'A key starts with mgk_. Create one in the console:',
    modelsTitle: 'Choose models',
    search: 'Search models',
    save: 'Save to WorkBuddy',
    recommended: 'Recommended',
    all: 'All models',
    pickAll: 'Select all',
    pickNone: 'Select none',
    images: 'images',
    reasoning: 'reasoning',
    gone: 'no longer available',
    count: (n) => `${n} selected`,
    working: 'Working…',
    keyOk: 'Key saved.',
    saved: (r) => `Saved: ${r.added.length} added, ${r.updated.length} updated, ${r.removed.length} removed. Back in WorkBuddy, the models are in the picker under the input box; if they are not, quit WorkBuddy completely and open it again.`,
    noMatch: 'No model matches',
    expired: 'This page has expired. Back in WorkBuddy, say "open ModelGo settings" to open it again.',
    errors: {
      FORMAT: 'That does not look like a ModelGo key: it starts with mgk_ and has no spaces.',
      AUTH: 'ModelGo did not accept this key. Check that it was copied in full and has not been deleted.',
      UNREACHABLE: 'Cannot reach ModelGo. Check your network and try again.',
      NO_KEY: 'Save a key first.',
      CONFLICT: 'A model with the same name is set up another way and was not overwritten. Untick it and try again: ',
      FAILED: 'Something went wrong: ',
    },
  };

  const $ = (id) => document.getElementById(id);
  document.documentElement.lang = zh ? 'zh' : 'en';
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = T[el.dataset.t];
  $('search').placeholder = T.search;

  const token = location.hash.slice(1);
  let data = { key: { set: false }, models: [], added: [], gone: [] };
  const picked = new Set();

  async function api(method, path, body) {
    let res;
    try {
      res = await fetch(path, { method, headers: { 'x-modelgo-token': token, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch { throw { code: 'EXPIRED' }; }
    const json = await res.json().catch(() => ({}));
    if (res.status === 403) throw { code: 'EXPIRED' };
    if (!res.ok) throw json;
    return json;
  }

  function explain(error) {
    if (error.code === 'EXPIRED') return T.expired;
    const text = T.errors[error.code];
    if (!text) return T.errors.FAILED + (error.error || '');
    return error.code === 'CONFLICT' || error.code === 'FAILED' ? text + (error.error || '') : text;
  }

  function show(el, text, kind) {
    el.hidden = !text;
    el.textContent = text || '';
    el.className = `msg ${kind || ''}`;
  }

  function chip(text, warn) {
    const el = document.createElement('span');
    el.className = warn ? 'chip warn' : 'chip';
    el.textContent = text;
    return el;
  }

  function row(model, gone) {
    const label = document.createElement('label');
    label.className = 'model';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = picked.has(model.id);
    box.addEventListener('change', () => { if (box.checked) picked.add(model.id); else picked.delete(model.id); count(); });
    const id = document.createElement('span');
    id.className = 'id';
    id.textContent = model.id;
    label.append(box, id);
    if (gone) label.append(chip(T.gone, true));
    if (model.images) label.append(chip(T.images));
    if (model.reasoning && model.reasoning.length) label.append(chip(T.reasoning));
    return label;
  }

  function group(title, models, withToggle) {
    const head = document.createElement('div');
    head.className = 'group';
    const name = document.createElement('span');
    name.textContent = title;
    head.append(name);
    if (withToggle && models.length) {
      const every = models.every((m) => picked.has(m.id));
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'quiet';
      toggle.textContent = every ? T.pickNone : T.pickAll;
      toggle.addEventListener('click', () => { for (const m of models) { if (every) picked.delete(m.id); else picked.add(m.id); } render(); });
      head.append(toggle);
    }
    const wrap = document.createDocumentFragment();
    wrap.append(head, ...models.map((m) => row(m, false)));
    return wrap;
  }

  function render() {
    const needle = $('search').value.trim().toLowerCase();
    const match = (m) => !needle || m.id.toLowerCase().includes(needle);
    const list = $('list');
    list.textContent = '';
    const top = data.models.filter((m) => m.recommended && match(m));
    const rest = data.models.filter((m) => !m.recommended && match(m));
    const gone = (data.gone || []).filter((id) => !needle || id.toLowerCase().includes(needle));
    if (top.length) list.append(group(T.recommended, top, true));
    if (rest.length) list.append(group(T.all, rest, false));
    for (const id of gone) list.append(row({ id }, true));
    if (!top.length && !rest.length && !gone.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = T.noMatch; list.append(p); }
    count();
  }

  function count() { $('count').textContent = T.count(picked.size); }

  function paint() {
    const has = data.key.set;
    $('step1').className = has ? 'step done' : 'step';
    $('step1').textContent = has ? '✓' : '1';
    $('keySaved').hidden = !has;
    $('keyForm').hidden = has;
    $('keyMasked').textContent = data.key.masked || '';
    $('consoleLink').href = data.console;
    $('modelsCard').hidden = !has;
    $('bar').hidden = !has;
    if (has) render(); else $('keyInput').focus();
  }

  async function load(first) {
    data = await api('GET', '/api/state');
    picked.clear();
    for (const id of data.added) picked.add(id);
    // Nothing added yet: start from the recommended set, so one click finishes the job.
    if (first && !data.added.length) for (const m of data.models) if (m.recommended) picked.add(m.id);
    paint();
  }

  $('keyChange').addEventListener('click', () => { $('keySaved').hidden = true; $('keyForm').hidden = false; $('keyInput').focus(); });

  $('keyForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('keySave');
    button.disabled = true;
    show($('keyMsg'), T.working);
    try {
      await api('POST', '/api/key', { key: $('keyInput').value });
      $('keyInput').value = '';
      await load(true);
      show($('keyMsg'), T.keyOk, 'ok');
    } catch (error) { show($('keyMsg'), explain(error), 'bad'); }
    button.disabled = false;
  });

  $('search').addEventListener('input', render);

  $('save').addEventListener('click', async () => {
    const button = $('save');
    button.disabled = true;
    show($('modelsMsg'), T.working);
    try {
      const result = await api('POST', '/api/models', { ids: [...picked] });
      await load(false);
      $('step2').className = 'step done';
      $('step2').textContent = '✓';
      show($('modelsMsg'), T.saved(result), 'ok');
    } catch (error) { show($('modelsMsg'), explain(error), 'bad'); }
    button.disabled = false;
  });

  load(true).catch((error) => { show($('pageMsg'), explain(error), 'bad'); paint(); });
})();
