/**
 * Maps a KeyboardEvent's *physical* key (event.code) to the character it
 * would produce under a standard US-QWERTY layout, ignoring whatever the
 * OS's active keyboard layout/language actually translated it to.
 *
 * A barcode scanner behaves like a USB HID keyboard: it sends physical key
 * presses, and the OS translates those into characters using whatever
 * layout is currently active. If that layout is Arabic (or anything
 * non-Latin), the translated characters are garbage relative to the ASCII
 * SKU the barcode actually encodes — "No variant with SKU ..." — even
 * though the scanner and the barcode itself are both fine. event.code
 * names the physical key (e.g. "KeyA", "Digit3", "Minus") and is the same
 * regardless of layout, so reconstructing the character from it side-steps
 * the OS's translation entirely.
 */

// [unshifted, shifted] — only the characters a SKU can actually contain
// (letters, digits, hyphen/underscore) need to be exact; anything else in
// here is just filled in for completeness so an unmapped key never
// silently eats a legitimate manual keystroke.
const CODE_TO_US_CHAR: Record<string, [string, string]> = {
  KeyA: ["a", "A"], KeyB: ["b", "B"], KeyC: ["c", "C"], KeyD: ["d", "D"],
  KeyE: ["e", "E"], KeyF: ["f", "F"], KeyG: ["g", "G"], KeyH: ["h", "H"],
  KeyI: ["i", "I"], KeyJ: ["j", "J"], KeyK: ["k", "K"], KeyL: ["l", "L"],
  KeyM: ["m", "M"], KeyN: ["n", "N"], KeyO: ["o", "O"], KeyP: ["p", "P"],
  KeyQ: ["q", "Q"], KeyR: ["r", "R"], KeyS: ["s", "S"], KeyT: ["t", "T"],
  KeyU: ["u", "U"], KeyV: ["v", "V"], KeyW: ["w", "W"], KeyX: ["x", "X"],
  KeyY: ["y", "Y"], KeyZ: ["z", "Z"],
  Digit0: ["0", ")"], Digit1: ["1", "!"], Digit2: ["2", "@"], Digit3: ["3", "#"],
  Digit4: ["4", "$"], Digit5: ["5", "%"], Digit6: ["6", "^"], Digit7: ["7", "&"],
  Digit8: ["8", "*"], Digit9: ["9", "("],
  Numpad0: ["0", "0"], Numpad1: ["1", "1"], Numpad2: ["2", "2"], Numpad3: ["3", "3"],
  Numpad4: ["4", "4"], Numpad5: ["5", "5"], Numpad6: ["6", "6"], Numpad7: ["7", "7"],
  Numpad8: ["8", "8"], Numpad9: ["9", "9"],
  NumpadSubtract: ["-", "-"],
  NumpadDecimal: [".", "."],
  Minus: ["-", "_"],
  Equal: ["=", "+"],
  Period: [".", ">"],
  Comma: [",", "<"],
  Slash: ["/", "?"],
  Backslash: ["\\", "|"],
  Semicolon: [";", ":"],
  Quote: ["'", '"'],
  BracketLeft: ["[", "{"],
  BracketRight: ["]", "}"],
  Backquote: ["`", "~"],
  Space: [" ", " "],
};

/**
 * Returns the US-QWERTY character for this keydown's physical key, or null
 * if it isn't a plain single-character key (e.g. Enter, Backspace, an
 * unmapped key) — callers should fall back to normal browser handling for
 * anything that returns null.
 */
export function getUsLayoutChar(event: { code: string; shiftKey: boolean }): string | null {
  const pair = CODE_TO_US_CHAR[event.code];
  if (!pair) return null;
  return event.shiftKey ? pair[1] : pair[0];
}
