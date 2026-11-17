/* Browser speech recognition (dictation) and speech synthesis helpers. */

interface RecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
}
interface RecognitionErrorLike {
  error: string;
}
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEventLike) => void) | null;
  onerror: ((e: RecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => RecognitionLike;

function getRecognition(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function voiceInputSupported(): boolean {
  return getRecognition() !== null;
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone access was blocked. Allow it in your browser settings to dictate.',
  'service-not-allowed': 'Microphone access was blocked. Allow it in your browser settings to dictate.',
  'no-speech': 'No speech heard. Try again and speak closer to the microphone.',
  'audio-capture': 'No microphone found on this device.',
  network: 'Speech recognition needs a network connection in this browser.',
  'language-not-supported': 'Your language is not supported for dictation in this browser.'
};

/**
 * Starts dictation. onText receives the full transcript of this session
 * (final + interim) each time it changes. Returns a function that stops it.
 */
export function startDictation(
  onText: (t: string) => void,
  onEnd: () => void,
  onError: (m: string) => void
): () => void {
  const Ctor = getRecognition();
  if (!Ctor) {
    onError('Voice input is not supported in this browser. Try Chrome, Edge or Safari.');
    onEnd();
    return () => undefined;
  }
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onEnd();
  };
  let rec: RecognitionLike;
  try {
    rec = new Ctor();
  } catch {
    onError('Could not start voice input.');
    finish();
    return () => undefined;
  }
  rec.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = (e) => {
    let text = '';
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
    }
    onText(text.trim());
  };
  rec.onerror = (e) => {
    if (e.error === 'aborted') return;
    onError(ERROR_MESSAGES[e.error] || 'Voice input stopped unexpectedly. Try again.');
  };
  rec.onend = finish;
  try {
    rec.start();
  } catch {
    onError('Could not start voice input.');
    finish();
  }
  return () => {
    try {
      rec.stop();
    } catch {
      finish();
    }
  };
}

/** Removes markdown syntax and code blocks so replies read naturally aloud. */
function toSpeakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' code block omitted. ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function speak(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const clean = toSpeakable(text);
  if (!clean) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  // Long replies are spoken in sentence-sized chunks: some engines cut off long utterances.
  const parts = clean.match(/[^.!?\n]+[.!?]*\s*/g) || [clean];
  const chunks: string[] = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + p).length > 220 && cur) {
      chunks.push(cur);
      cur = p;
    } else {
      cur += p;
    }
  }
  if (cur.trim()) chunks.push(cur);
  const lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
  for (const c of chunks) {
    const u = new SpeechSynthesisUtterance(c.trim());
    u.lang = lang;
    u.rate = 1;
    synth.speak(u);
  }
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
}
