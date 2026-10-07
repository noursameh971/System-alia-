/**
 * The browser's Web Speech API (speech-to-text) — just the slice the
 * assistant uses. TypeScript's DOM lib doesn't ship these types, so they're
 * declared here from the spec (https://webaudio.github.io/web-speech-api/).
 *
 * Availability: Chrome, Edge and Safari (all prefixed as
 * webkitSpeechRecognition in at least some versions); not Firefox. Chrome
 * and Edge send the audio to Google's / Microsoft's speech service, so it
 * needs a network connection — free, but not on-device. It also requires a
 * secure context (https, or localhost in development).
 */

export interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

export interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

export type SpeechRecognitionErrorCode =
  | "aborted"
  | "audio-capture"
  | "bad-grammar"
  | "language-not-supported"
  | "network"
  | "no-speech"
  | "not-allowed"
  | "service-not-allowed";

export interface SpeechRecognitionErrorEvent extends Event {
  readonly error: SpeechRecognitionErrorCode;
  readonly message: string;
}

export interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognition;

export function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor });
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

/** The two languages the assistant listens in. Egyptian Arabic recognizes Egyptian dialect and Modern Standard Arabic alike. */
export type SpeechLanguage = "ar-EG" | "en-US";
