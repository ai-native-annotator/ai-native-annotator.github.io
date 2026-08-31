/**
 * Voice: speech-to-text dictation for the chat input, and optional
 * text-to-speech for AI replies. Both are native Web Speech API — no
 * backend, nothing leaves the browser except (for STT) audio going to the
 * browser vendor's own recognition service, same as any other page using
 * this API. Feature-detected: on unsupported browsers the mic button simply
 * does not render, rather than failing when clicked.
 */

import { logInfo, logWarn, describeError } from './core/log.js';
import { t } from './core/i18n.js';

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

export const sttSupported = Boolean(SpeechRecognitionCtor);
export const ttsSupported = Boolean(window.speechSynthesis);

/**
 * Wire a mic button to dictate into `onResult(text)`. Returns a controller
 * with `.stop()`, or null if speech recognition isn't available here.
 */
export function startDictation({ lang, onResult, onEnd, onError }) {
  if (!sttSupported) return null;
  const rec = new SpeechRecognitionCtor();
  rec.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
  rec.interimResults = true;
  rec.continuous = false;

  rec.onresult = (e) => {
    let text = '';
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
    onResult(text, e.results[e.results.length - 1].isFinal);
  };
  rec.onerror = (e) => {
    logWarn('voice', t('voice.recError', { err: e.error }));
    onError?.(e.error);
  };
  rec.onend = () => onEnd?.();

  try {
    rec.start();
    logInfo('voice', t('voice.listening'));
  } catch (err) {
    logWarn('voice', t('voice.startFailed', { err: describeError(err) }));
    return null;
  }
  return { stop: () => { try { rec.stop(); } catch { /* already stopped */ } } };
}

export function speak(text, lang) {
  if (!ttsSupported || !text) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(stripForSpeech(text));
    u.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
    window.speechSynthesis.speak(u);
  } catch (err) {
    logWarn('voice', t('voice.speakFailed', { err: describeError(err) }));
  }
}

export function stopSpeaking() {
  if (ttsSupported) window.speechSynthesis.cancel();
}

function stripForSpeech(text) {
  return String(text)
    .replace(/```[\s\S]*?```/g, t('voice.codeBlock'))
    .replace(/[*_`#>]/g, '')
    .slice(0, 600);
}
