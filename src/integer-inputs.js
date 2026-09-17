/**
 * Keep a text input editable while accepting only ASCII digits, up to 20.
 * Empty values and leading zeroes are preserved; numeric meaning is validated
 * when the form is submitted. No Number conversion or character stripping.
 *
 * Usage:
 *   bindUnsignedIntegerInput(document.getElementById('prime-p'), ({ reason }) => {
 *     // Optionally explain: reason is 'characters' or 'length'.
 *   });
 *
 * Keep type="text" (or omit type), with inputmode="numeric" for mobile keys.
 * Valid native edits retain browser selection, clipboard and undo behavior.
 * Returns { sync, destroy }; sync can record a programmatically set value.
 */
export const MAX_INTEGER_DIGITS = 20;

export function unsignedIntegerTextError(value) {
  if (typeof value !== 'string' || !/^[0-9]*$/.test(value)) return 'characters';
  return value.length > MAX_INTEGER_DIGITS ? 'length' : null;
}

function snapshot(input) {
  const value = input.value;
  return {
    value,
    start: input.selectionStart ?? value.length,
    end: input.selectionEnd ?? value.length,
    direction: input.selectionDirection ?? 'none',
  };
}

function insertionError(state, text) {
  const textError = unsignedIntegerTextError(text);
  if (textError) return textError;
  return unsignedIntegerTextError(
    state.value.slice(0, state.start) + text + state.value.slice(state.end),
  );
}

export function bindUnsignedIntegerInput(input, onReject = () => {}) {
  let accepted = unsignedIntegerTextError(input.value)
    ? { value: '', start: 0, end: 0, direction: 'none' }
    : snapshot(input);
  let transferText = null;
  const listeners = [];

  const restore = () => {
    input.value = accepted.value;
    input.setSelectionRange(accepted.start, accepted.end, accepted.direction);
  };
  const remember = () => {
    if (!unsignedIntegerTextError(input.value)) accepted = snapshot(input);
  };
  const reject = (reason, source, event) => {
    if (event?.cancelable) event.preventDefault();
    restore();
    transferText = null;
    onReject({ reason, source });
  };
  const sync = event => {
    const reason = unsignedIntegerTextError(input.value);
    if (reason) {
      // A rejected fallback must not look like an accepted edit to the form's
      // bubbling input listener (which may clear feedback or recalculate).
      event?.stopPropagation();
      reject(reason, 'input', event);
    }
    else accepted = snapshot(input);
    transferText = null;
  };
  const listen = (name, handler) => {
    input.addEventListener(name, handler);
    listeners.push([name, handler]);
  };

  // Snapshot selection before edits so fallback rejection restores the caret
  // and selected range, including a previously selected replacement target.
  for (const name of ['focus', 'select', 'keyup', 'pointerup', 'compositionstart']) {
    listen(name, remember);
  }
  listen('keydown', event => {
    remember();
    // Leave shortcuts, arrows, deletion and IME processing to the browser.
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    if (event.key?.length === 1 && !/^[0-9]$/.test(event.key)) {
      reject('characters', 'typing', event);
    }
  });

  for (const source of ['paste', 'drop']) {
    listen(source, event => {
      remember();
      const transfer = source === 'paste' ? event.clipboardData : event.dataTransfer;
      if (!transfer) return; // The input fallback still enforces the full value.
      const text = transfer.getData('text/plain');
      const reason = insertionError(accepted, text);
      if (reason || (transfer.files?.length && text === '')) {
        reject(reason || 'characters', source, event);
      } else {
        // Keep the original payload for browsers whose beforeinput.data is null.
        // Native insertion preserves undo and the platform's drop position.
        transferText = text;
      }
    });
  }

  listen('beforeinput', event => {
    remember();
    if (!event.inputType?.startsWith('insert')) return;
    if (event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph') {
      reject('characters', 'typing', event);
      return;
    }
    let text = event.data;
    if (text == null && event.dataTransfer) text = event.dataTransfer.getData('text/plain');
    if (text == null && /Paste|Drop/.test(event.inputType)) text = transferText;
    if (text == null) return;
    // Autofill replacements can target a range that differs from the caret.
    // Validate their payload now and their final whole value in the input event.
    const reason = event.inputType === 'insertReplacementText'
      ? unsignedIntegerTextError(text)
      : insertionError(accepted, text);
    if (reason) reject(reason, event.inputType, event);
  });

  // Covers noncancelable IME edits, autofill, accessibility input and browsers
  // without beforeinput. Restore the last complete value; never filter 1e3 to 13.
  listen('input', sync);
  listen('compositionend', sync);
  sync();
  return {
    sync,
    destroy() {
      for (const [name, handler] of listeners) input.removeEventListener(name, handler);
    },
  };
}
