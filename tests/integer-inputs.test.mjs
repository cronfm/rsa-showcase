import test from 'node:test';
import assert from 'node:assert/strict';
import { bindUnsignedIntegerInput, unsignedIntegerTextError } from '../src/integer-inputs.js';

class InputStub extends EventTarget {
  constructor(value = '') {
    super();
    this.value = value;
    this.selectionStart = this.selectionEnd = value.length;
    this.selectionDirection = 'none';
  }
  setSelectionRange(start, end, direction = 'none') {
    this.selectionStart = start;
    this.selectionEnd = end;
    this.selectionDirection = direction;
  }
  emit(type, fields = {}, cancelable = true) {
    const event = new Event(type, { cancelable });
    Object.assign(event, fields);
    this.dispatchEvent(event);
    return event;
  }
  insert(text, inputType = 'insertText', beforeInputCancelable = true) {
    const event = this.emit('beforeinput', { inputType, data: text }, beforeInputCancelable);
    if (event.defaultPrevented) return false;
    const start = this.selectionStart;
    this.value = this.value.slice(0, start) + text + this.value.slice(this.selectionEnd);
    this.setSelectionRange(start + text.length, start + text.length);
    this.emit('input', { inputType, data: text }, false);
    return true;
  }
}
const clipboard = text => ({ getData: () => text, files: [] });

test('integer text retains exact digits, leading zeroes and empty edit states', () => {
  for (const text of ['', '0', '00061', '18446744073709551615', '99999999999999999999']) {
    assert.equal(unsignedIntegerTextError(text), null);
  }
  for (const text of ['e', '1e3', '+61', '-5', '1.5', ' 61', '61\n', '１２', '١٢']) {
    assert.equal(unsignedIntegerTextError(text), 'characters');
  }
  assert.equal(unsignedIntegerTextError('1'.repeat(21)), 'length');
});

test('typing blocks letters, exponent notation, signs and decimal points', () => {
  const input = new InputStub('61');
  const rejected = [];
  bindUnsignedIntegerInput(input, rejection => rejected.push(rejection));
  for (const key of ['a', 'e', 'E', '+', '-', '.', ' ']) {
    assert.equal(input.emit('keydown', { key }).defaultPrevented, true);
    assert.equal(input.value, '61');
  }
  assert.equal(input.insert('3'), true);
  assert.equal(input.value, '613');
  assert.equal(input.insert('x'), false);
  assert.equal(input.value, '613');
  assert.equal(rejected.length, 8);
});

test('selection replacement respects the 20-digit limit without rounding', () => {
  const input = new InputStub('12345678901234567890');
  bindUnsignedIntegerInput(input);
  assert.equal(input.insert('1'), false);
  assert.equal(input.value, '12345678901234567890');
  input.setSelectionRange(0, 2, 'forward');
  assert.equal(input.insert('00'), true);
  assert.equal(input.value, '00345678901234567890');
  assert.equal(input.selectionStart, 2);
});

test('mixed paste and drop are rejected as whole payloads', () => {
  for (const source of ['paste', 'drop']) {
    const input = new InputStub('61');
    input.setSelectionRange(0, 2, 'backward');
    bindUnsignedIntegerInput(input);
    for (const text of ['1e3', 'a12', ' 123 ', '12\n34', '9'.repeat(21)]) {
      const event = input.emit(source, {
        [source === 'paste' ? 'clipboardData' : 'dataTransfer']: clipboard(text),
      });
      assert.equal(event.defaultPrevented, true);
      assert.equal(input.value, '61');
      assert.equal(input.selectionStart, 0);
      assert.equal(input.selectionEnd, 2);
      assert.equal(input.selectionDirection, 'backward');
    }
    const exact = '18446744073709551615';
    assert.equal(input.emit(source, {
      [source === 'paste' ? 'clipboardData' : 'dataTransfer']: clipboard(exact),
    }).defaultPrevented, false);
    input.insert(exact, source === 'paste' ? 'insertFromPaste' : 'insertFromDrop');
    assert.equal(input.value, exact);
  }
});

test('paste capacity is checked before the browser can truncate the text', () => {
  const input = new InputStub('12345678901234567890');
  bindUnsignedIntegerInput(input);
  assert.equal(input.emit('paste', { clipboardData: clipboard('1') }).defaultPrevented, true);
  input.setSelectionRange(0, 1);
  assert.equal(input.emit('paste', { clipboardData: clipboard('00') }).defaultPrevented, true);
  assert.equal(input.value, '12345678901234567890');
});

test('shortcuts, navigation, deletion, empty values and undo remain native', () => {
  const input = new InputStub('61');
  bindUnsignedIntegerInput(input);
  for (const fields of [
    {key: 'a', ctrlKey: true}, {key: 'v', metaKey: true}, {key: 'z', ctrlKey: true},
    {key: 'Backspace'}, {key: 'Delete'}, {key: 'ArrowLeft'}, {key: 'Home'},
    {key: 'End'}, {key: 'Tab'}, {key: 'Enter'},
  ]) assert.equal(input.emit('keydown', fields).defaultPrevented, false);
  input.setSelectionRange(0, 2);
  assert.equal(input.emit('beforeinput', {inputType: 'deleteContentBackward', data: null}).defaultPrevented, false);
  input.value = '';
  input.setSelectionRange(0, 0);
  input.emit('input', {}, false);
  assert.equal(input.value, '');
  input.emit('beforeinput', {inputType: 'historyUndo', data: null});
  input.value = '61';
  input.setSelectionRange(0, 2);
  input.emit('input', {}, false);
  assert.equal(input.value, '61');
});

test('fallback rejects autofill text and restores the previous value and caret', () => {
  const input = new InputStub('6173');
  bindUnsignedIntegerInput(input);
  input.setSelectionRange(1, 3, 'backward');
  input.emit('select');
  input.value = '6hello3';
  input.setSelectionRange(6, 6);
  const event = input.emit('input', {}, false);
  assert.equal(event.cancelBubble, true);
  assert.equal(input.value, '6173');
  assert.equal(input.selectionStart, 1);
  assert.equal(input.selectionEnd, 3);
  assert.equal(input.selectionDirection, 'backward');
});

test('noncancelable composition is rolled back without stripping its characters', () => {
  const input = new InputStub('61');
  input.setSelectionRange(0, 2);
  bindUnsignedIntegerInput(input);
  input.emit('compositionstart');
  input.insert('1e3', 'insertCompositionText', false);
  input.emit('compositionend', {}, false);
  assert.equal(input.value, '61');
  assert.equal(input.selectionStart, 0);
  assert.equal(input.selectionEnd, 2);
});

test('valid autofill replacement is accepted even when longer than the old selection', () => {
  const input = new InputStub('61');
  bindUnsignedIntegerInput(input);
  const exact = '18446744073709551615';
  assert.equal(input.emit('beforeinput', { inputType: 'insertReplacementText', data: exact }).defaultPrevented, false);
  input.value = exact;
  input.setSelectionRange(20, 20);
  input.emit('input', {}, false);
  assert.equal(input.value, exact);
});

test('programmatic presets are captured and bindings can be detached', () => {
  const input = new InputStub('61');
  const binding = bindUnsignedIntegerInput(input);
  input.value = '1013';
  input.setSelectionRange(4, 4);
  assert.equal(input.insert('e'), false);
  assert.equal(input.value, '1013', 'beforeinput captures a preset without an explicit sync');
  input.value = '1009';
  input.setSelectionRange(4, 4);
  binding.sync();
  input.value = '1009e';
  input.emit('input', {}, false);
  assert.equal(input.value, '1009');
  binding.destroy();
  input.value = 'text';
  input.emit('input', {}, false);
  assert.equal(input.value, 'text');
});
