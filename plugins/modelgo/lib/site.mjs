/**
 * Reading what the ModelGo site offers to one key.
 *
 * `GET /v1/models` is filtered by the key's policy, so the answer is "what this
 * key may use". Which wire protocols a model accepts is not in that listing; it
 * is read from `GET /v1/models/{model}/endpoints`. WorkBuddy calls custom
 * models over OpenAI Chat Completions, so only models offered on that protocol
 * are usable here.
 */

// Fixed on purpose, with no environment override: this tool runs inside an agent, and a
// configurable address would let injected instructions send the saved key somewhere else.
export const SITE_ROOT = 'https://api.modelgo.ai';
export const CHAT_URL = `${SITE_ROOT}/v1/chat/completions`;
export const CONSOLE_URL = 'https://modelgo.ai';
const CHAT_PROTOCOL = 'openai_chat_completions';
const CONCURRENCY = 8;

/** A key ModelGo could have issued: the `mgk_` prefix, then printable ASCII with no spaces. */
export const looksLikeKey = (value) => typeof value === 'string' && /^mgk_[\x21-\x7E]{8,}$/.test(value);

/** A key as it may be shown: enough to recognise it, never enough to use it. */
export const mask = (key) => (typeof key === 'string' && key.length > 12 ? `${key.slice(0, 7)}…${key.slice(-4)}` : '(not set)');

/** Remove a key (and anything shaped like one) from text bound for the screen or a log. */
export function redact(text, key) {
  let out = String(text ?? '');
  if (key) out = out.split(key).join('<redacted>');
  return out.replace(/mgk_[A-Za-z0-9_-]{8,}/g, 'mgk_<redacted>');
}

export class SiteError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'SiteError';
    this.code = code;
    this.status = status;
  }
}

async function getJson(url, key, { fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  let res;
  try {
    // Redirects are not followed, so the bearer key is never replayed to another host.
    res = await fetchImpl(url, { headers: { accept: 'application/json', authorization: `Bearer ${key}` }, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new SiteError(redact(`cannot reach ${new URL(url).host}: ${error?.message ?? error}`, key), error?.name === 'TimeoutError' ? 'TIMEOUT' : 'UNREACHABLE');
  }
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = undefined; }
  if (!res.ok) {
    const code = res.status === 401 || res.status === 403 ? 'AUTH' : res.status === 429 ? 'RATE_LIMIT' : 'HTTP';
    throw new SiteError(redact(`HTTP ${res.status}: ${body?.error?.message ?? text.slice(0, 200)}`, key), code, res.status);
  }
  if (body === undefined) throw new SiteError('the site returned a non-JSON body', 'BAD_RESPONSE', res.status);
  return body;
}

const positiveInt = (value) => (Number.isInteger(value) && value > 0 ? value : undefined);
const strings = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === 'string') : undefined);

/** Normalize a `/v1/models` body, in site order, dropping duplicates. */
export function parseModelList(body) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(body?.data) ? body.data : []) {
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      contextWindow: positiveInt(item.context_length),
      // Not published today; read once the site starts sending them.
      maxTokens: positiveInt(item.max_output_tokens),
      protocols: strings(item.public_protocols),
      input: strings(item.input_modalities),
      output: strings(item.output_modalities),
    });
  }
  return out;
}

/** Text-only output is the first test for a chat model; the protocol list is the second. */
export const mayBeChatModel = (entry) => (entry.output?.length ? entry.output.every((m) => m === 'text') : true);

/** The gateway takes the query form for ids containing `/`. */
export function endpointsUrl(id) {
  return id.includes('/')
    ? `${SITE_ROOT}/v1/models/endpoints?model=${encodeURIComponent(id)}`
    : `${SITE_ROOT}/v1/models/${encodeURIComponent(id)}/endpoints`;
}

/**
 * The chat models this key can call from WorkBuddy.
 * @returns entries in site order, plus the ids left out because the site does
 *   not offer them on Chat Completions, and those whose protocols could not be read.
 */
export async function listChatModels(key, options = {}) {
  const entries = parseModelList(await getJson(`${SITE_ROOT}/v1/models`, key, options)).filter(mayBeChatModel);
  const pending = entries.filter((entry) => !entry.protocols);
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    await Promise.all(pending.slice(i, i + CONCURRENCY).map(async (entry) => {
      try {
        const body = await getJson(endpointsUrl(entry.id), key, options);
        entry.protocols = (Array.isArray(body?.data) ? body.data : []).map((d) => d?.code).filter((c) => typeof c === 'string');
      } catch { /* left undefined: reported as unknown, not guessed */ }
    }));
  }
  return {
    models: entries.filter((entry) => entry.protocols?.includes(CHAT_PROTOCOL)),
    notOnChat: entries.filter((entry) => entry.protocols && !entry.protocols.includes(CHAT_PROTOCOL)).map((entry) => entry.id),
    unknown: entries.filter((entry) => !entry.protocols).map((entry) => entry.id),
  };
}

/** A free check that a key works: it lists models and sends no model request. */
export async function verifyKey(key, options = {}) {
  return parseModelList(await getJson(`${SITE_ROOT}/v1/models`, key, options)).length;
}
