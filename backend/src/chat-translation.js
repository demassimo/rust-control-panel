const DEFAULT_TRANSLATE_BASE = (process.env.CHAT_TRANSLATE_URL || 'https://libretranslate.com').trim().replace(/\/+$/, '');
const CHAT_TRANSLATE_TARGET = (process.env.CHAT_TRANSLATE_TARGET_LANG || process.env.CHAT_TRANSLATE_TARGET || '').trim();
const CHAT_TRANSLATE_SOURCE = (process.env.CHAT_TRANSLATE_SOURCE_LANG || '').trim() || 'auto';
const CHAT_TRANSLATE_API_KEY = (process.env.CHAT_TRANSLATE_API_KEY || '').trim();
const CHAT_TRANSLATE_TIMEOUT_MS = Math.max(2500, Number(process.env.CHAT_TRANSLATE_TIMEOUT_MS) || 5000);
const LANGUAGE_CODE_REGEX = /^[a-z]{2,8}(?:-[a-z0-9]{2,8})?$/i;
const DEFAULT_TRANSLATE_TARGET = normalizeLanguageCode(CHAT_TRANSLATE_TARGET) || null;
const DEFAULT_TRANSLATE_SOURCE = normalizeLanguageCode(CHAT_TRANSLATE_SOURCE, { allowAuto: true }) || 'auto';

function getTranslateUrl() {
  return DEFAULT_TRANSLATE_BASE || 'https://libretranslate.com';
}

export function isChatTranslationEnabled() {
  return Boolean(DEFAULT_TRANSLATE_TARGET);
}

function buildTimeoutSignal(timeoutMs) {
  if (typeof AbortController === 'undefined') return null;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs).unref?.();
  return controller;
}

export function normalizeLanguageCode(value, { allowAuto = false } = {}) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (allowAuto && lower === 'auto') return 'auto';
  if (!LANGUAGE_CODE_REGEX.test(lower)) return null;
  return lower.slice(0, 16);
}

function resolveTargetLanguage(override) {
  const normalized = normalizeLanguageCode(override);
  if (normalized) return normalized;
  return DEFAULT_TRANSLATE_TARGET;
}

function resolveSourceLanguage(override) {
  const normalized = normalizeLanguageCode(override, { allowAuto: true });
  if (normalized) return normalized;
  return DEFAULT_TRANSLATE_SOURCE || 'auto';
}

export async function translateChatMessage(text, options = {}) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const targetLanguage = resolveTargetLanguage(options?.targetLanguage);
  if (!targetLanguage) return null;
  const sourceLanguage = resolveSourceLanguage(options?.sourceLanguage);
  const params = new URLSearchParams();
  params.append('q', trimmed);
  params.append('source', sourceLanguage);
  params.append('target', targetLanguage);
  params.append('format', 'text');
  if (CHAT_TRANSLATE_API_KEY) params.append('api_key', CHAT_TRANSLATE_API_KEY);

  let response;
  try {
    const controller = buildTimeoutSignal(CHAT_TRANSLATE_TIMEOUT_MS);
    response = await fetch(`${getTranslateUrl()}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: controller?.signal
    });
  } catch (err) {
    console.warn('chat translation request failed', err);
    return null;
  }

  if (!response.ok) {
    console.warn(`chat translation failed with status ${response.status}`);
    return null;
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    console.warn('chat translation response parse failed', err);
    return null;
  }

  const translated = typeof data?.translatedText === 'string' ? data.translatedText.trim() : '';
  if (!translated || translated.toLowerCase() === trimmed.toLowerCase()) return null;
  const detectedLanguage = data?.detectedLanguage?.language
    || data?.detected_language
    || data?.detectedSourceLanguage
    || data?.detected_language;
  return {
    text: translated,
    provider: 'libretranslate',
    targetLanguage,
    detectedLanguage: detectedLanguage || null,
    sourceLanguage
  };
}
