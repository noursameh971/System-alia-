"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSpeechRecognition, type SpeechLanguage, type SpeechRecognition, type SpeechRecognitionErrorCode } from "@/lib/speechRecognition";

/** English source strings for t(). "aborted" is absent on purpose: it's what our own stop/abort produces. */
const ERROR_MESSAGES: Partial<Record<SpeechRecognitionErrorCode, string>> = {
  "not-allowed": "Microphone access is blocked — allow it for this site in your browser's settings.",
  "service-not-allowed": "Microphone access is blocked — allow it for this site in your browser's settings.",
  "audio-capture": "No microphone was found.",
  network: "Voice input needs an internet connection.",
  "no-speech": "Didn't catch anything — tap the mic and try again.",
  "language-not-supported": "Your browser can't recognize this language — try switching languages.",
};

/**
 * Browser speech-to-text for the assistant's input box. While listening it
 * reports the whole transcript so far (final words plus the in-progress
 * guess) on every update, so the caller can show it live and the text
 * settles as the browser firms it up.
 *
 * Continuous: it keeps listening through pauses until stop() — the admin
 * decides when they're done, rather than the browser cutting them off
 * mid-thought.
 */
export function useSpeechInput({
  onTranscript,
  onError,
}: {
  onTranscript: (transcript: string) => void;
  /** An English source string, ready for t(). */
  onError: (message: string) => void;
}) {
  // Read once on mount: support can't change during a session, and this
  // component only ever renders on the client (inside the closed-by-default
  // assistant sheet), so there's no server render to mismatch.
  const [supported] = useState(() => getSpeechRecognition() !== null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Latest callbacks without restarting recognition when they change identity.
  const handlers = useRef({ onTranscript, onError });
  useEffect(() => {
    handlers.current = { onTranscript, onError };
  }, [onTranscript, onError]);

  /** Done talking: words still being finalized are delivered, then it ends. */
  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  /**
   * Discard and end now — for when the text box has moved on without it
   * (the admin typed, sent, or closed the panel). Unlike stop(), no late
   * result arrives afterwards to overwrite what's in the box.
   */
  const abort = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognitionRef.current = null;
    setListening(false);
    recognition.abort();
  }, []);

  const start = useCallback((language: SpeechLanguage) => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) return;
    // Starting again (e.g. after switching language) replaces the old session.
    recognitionRef.current?.abort();

    const recognition = new Recognition();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      // Segments are joined with a space and doubles collapsed: browsers
      // differ (by language, too) on whether a segment carries its own
      // leading space.
      const segments: string[] = [];
      for (let i = 0; i < event.results.length; i++) {
        segments.push(event.results[i]![0]!.transcript);
      }
      handlers.current.onTranscript(segments.join(" ").replace(/\s+/g, " ").trim());
    };
    recognition.onerror = (event) => {
      const message = ERROR_MESSAGES[event.error];
      if (message) handlers.current.onError(message);
    };
    recognition.onend = () => {
      // An old session ending after a restart mustn't flip the new one off.
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
        setListening(false);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      // start() throws if a session is somehow still live; treat as not listening.
      recognitionRef.current = null;
      setListening(false);
    }
  }, []);

  // Never leave the microphone on after the panel goes away.
  useEffect(() => () => recognitionRef.current?.abort(), []);

  return { supported, listening, start, stop, abort };
}
