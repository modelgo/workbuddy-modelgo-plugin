/**
 * Turning a ModelGo model into a WorkBuddy custom-model entry.
 *
 * WorkBuddy reads custom models from `models.json`. The fields written here are
 * the ones WorkBuddy documents (`id`, `name`, `vendor`, `url`, `apiKey`,
 * `maxInputTokens`, `maxOutputTokens`, `supportsToolCall`, `supportsImages`,
 * `supportsReasoning`, `reasoning`).
 *
 * What a model can do comes from the site where the site says it (context
 * window, image input). Reasoning levels and output caps are not in the site's
 * listing, so they come from two shipped files: the profiles say which levels a
 * model has, and `efforts.json` records which `reasoning_effort` values the
 * site accepted for it over Chat Completions, the wire WorkBuddy uses. A level
 * is offered only when both agree. A model with no profile is entered without
 * reasoning levels rather than with guessed ones.
 */
import { readFileSync } from 'node:fs';
import { CHAT_URL } from './site.mjs';

export const VENDOR = 'ModelGo';
export const DEFAULT_MAX_INPUT = 128_000;
export const DEFAULT_MAX_OUTPUT = 32_768;
/** The effort names WorkBuddy's picker knows, lowest first. */
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
/** Levels a reasoning model has unless its profile says otherwise; the two above them exist only where a profile names them. */
const BASE_EFFORTS = new Set(['low', 'medium', 'high']);

let shipped;
export function profiles() {
  shipped ??= JSON.parse(readFileSync(new URL('../data/model-profiles.json', import.meta.url), 'utf8'));
  return shipped;
}

let probedEfforts;
/** What the site accepted per model when probed; written by `scripts/probe-efforts.mjs`. */
export function probed() {
  probedEfforts ??= JSON.parse(readFileSync(new URL('../data/efforts.json', import.meta.url), 'utf8')).models ?? {};
  return probedEfforts;
}

/** An entry this plugin wrote: it points at the ModelGo chat endpoint. Anything else is never touched. */
export const isOurs = (entry) => typeof entry?.url === 'string' && entry.url === CHAT_URL;

/**
 * The reasoning block for one model, or `undefined` when it has no levels.
 * A level the profile marks `null` is one the model does not have; a level the
 * site refused when probed is left out too. A model that was not probed goes
 * by its profile alone.
 */
export function reasoningFor(profile, accepted) {
  if (!profile?.reasoning) return undefined;
  const map = profile.thinkingLevelMap;
  const supported = EFFORTS
    .filter((level) => (BASE_EFFORTS.has(level) ? map?.[level] !== null : typeof map?.[level] === 'string'))
    .filter((level) => !accepted || accepted.efforts.includes(level));
  if (!supported.length) return undefined;
  return {
    supportedEfforts: supported,
    // WorkBuddy needs a starting level; the middle of the road where the model has one.
    defaultEffort: ['medium', 'high'].find((level) => supported.includes(level)) ?? supported[0],
    canDisableThinking: map?.off !== null && accepted?.canDisableThinking !== false,
  };
}

/**
 * Build the entry for one model.
 * @param model - the site's entry (`id`, `contextWindow`, `maxTokens`, `input`).
 * @param key - the API key; WorkBuddy keeps custom-model keys in `models.json`.
 */
export function entryFor(model, key, data = profiles(), accepted = probed()) {
  const profile = { ...data.models?.[model.id], ...data.sites?.modelgo?.[model.id] };
  const reasoning = reasoningFor(profile, accepted[model.id]);
  return {
    id: model.id,
    name: model.id,
    vendor: VENDOR,
    url: CHAT_URL,
    apiKey: key,
    maxInputTokens: model.contextWindow ?? profile.contextWindow ?? DEFAULT_MAX_INPUT,
    maxOutputTokens: model.maxTokens ?? profile.maxTokens ?? DEFAULT_MAX_OUTPUT,
    supportsToolCall: true,
    supportsImages: (model.input ?? profile.input ?? []).includes('image'),
    supportsReasoning: Boolean(reasoning),
    ...(reasoning ? { reasoning } : {}),
  };
}
