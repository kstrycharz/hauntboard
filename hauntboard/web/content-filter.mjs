// A reader preference, not a publishing restriction. Keep matching local: sealed
// messages must never be sent to a classification service.
export const NSFW_PREFERENCE = 'hauntboard-show-nsfw';
const language = /\b(?:nigg(?:er|a)s?|kikes?|spics?|chinks?|fagg?ots?|fuck(?:ing|ed|er|ers|s)?|motherfuck\w*|shit(?:ty|s)?|cunts?|porn(?:ography|ographic)?|xxx|blowjobs?|cumshots?)\b/iu;

export function isNsfw(content, fallbackTitle = '') {
  if (content?.nsfw === true) return true;
  const text = [fallbackTitle, content?.title, content?.name, content?.body]
    .filter(value => typeof value === 'string').join(' ')
    .normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/gu, '');
  return language.test(text);
}

export function readNsfwPreference(storage) {
  try { return storage.getItem(NSFW_PREFERENCE) === 'true'; }
  catch { return false; }
}

export function saveNsfwPreference(storage, enabled) {
  try { storage.setItem(NSFW_PREFERENCE, String(enabled === true)); }
  catch { /* The in-memory choice still works when storage is unavailable. */ }
}
