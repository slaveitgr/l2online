export const XDAT_CONTROL_TYPES = new Set([
  "Window",
  "Button",
  "Texture",
  "TextBox",
  "Text",
  "EditBox",
  "CheckBox",
  "StatusBar",
  "SliderCtrl",
  "ListCtrl",
  "RichListCtrl",
  "ScrollArea",
  "StatusIconCtrl",
  "Tab",
  "ProgressBar",
  "DrawPanel",
  "ItemWindow",
]);

export interface XdatTopRecord {
  index: number;
  offset: number;
  primary: string;
  secondary: string;
  fields: number[];
}

export interface XdatControl {
  type: string;
  name: string;
  offset: number;
  parent: string | null;
  texture: string | null;
  dims: number[];
  positions: number[];
}

export interface XdatControlSummary {
  controls: number;
  windows: number;
  texturedControls: number;
  controlTypes: Record<string, number>;
}

export interface XdatParseResult {
  count: number;
  parsedRecords: number;
  records: XdatTopRecord[];
  controls: XdatControl[];
  byWindow: Record<string, XdatControl[]>;
  summary: XdatControlSummary;
}

interface LenString {
  text: string;
  next: number;
  length: number;
}

interface ControlStart {
  type: string;
  name: string;
  fieldsStart: number;
}

interface Token {
  kind: "string" | "int32";
  value: string | number;
  offset: number;
}

const decoder = new TextDecoder("windows-1252");

export function parseXdatControls(bytes: Uint8Array): XdatParseResult {
  const records = parseTopRecords(bytes);
  const controls = parseControls(bytes);
  const { byWindow, summary } = groupControls(controls);
  return {
    count: readU32(bytes, 0),
    parsedRecords: records.length,
    records,
    controls,
    byWindow,
    summary,
  };
}

export function summarizeXdatControls(controls: XdatControl[]): XdatControlSummary {
  return groupControls(controls).summary;
}

function parseTopRecords(bytes: Uint8Array): XdatTopRecord[] {
  const count = readU32(bytes, 0);
  const records: XdatTopRecord[] = [];
  let off = 4;
  for (let i = 0; i < count && off < bytes.length; i++) {
    const start = off;
    const primary = readLenString(bytes, off);
    if (!primary) break;
    off = primary.next;
    const secondary = readLenString(bytes, off);
    if (!secondary) break;
    off = secondary.next;

    const dataStart = off;
    let next = bytes.length;
    for (let p = off; p < Math.min(bytes.length, off + 64); p++) {
      if (readLenString(bytes, p)) {
        next = p;
        break;
      }
    }
    const fields: number[] = [];
    for (let p = dataStart; p + 4 <= next; p += 4) fields.push(readU32(bytes, p));
    records.push({ index: i, offset: start, primary: primary.text, secondary: secondary.text, fields });
    off = next;
  }
  return records;
}

function parseControls(bytes: Uint8Array, start = 1000, end = bytes.length): XdatControl[] {
  const controls: XdatControl[] = [];
  let off = start;
  while (off < end) {
    const ctrl = controlAt(bytes, off);
    if (!ctrl) {
      off += 1;
      continue;
    }

    let next = ctrl.fieldsStart;
    const limit = Math.min(end, ctrl.fieldsStart + 320);
    while (next < limit && !controlAt(bytes, next)) next += 1;

    const tokens = tokenizeFields(bytes, ctrl.fieldsStart, next);
    const strings = tokens
      .filter((token): token is Token & { value: string } => token.kind === "string" && token.value !== "undefined")
      .map((token) => token.value);
    const ints = tokens
      .filter((token): token is Token & { value: number } => token.kind === "int32")
      .map((token) => token.value);

    const parent = strings[0] ?? null;
    let texture: string | null = null;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const token = tokens[i];
      if (token.kind === "string" && looksLikeTextureRef(token.value)) {
        texture = token.value;
        break;
      }
    }

    controls.push({
      type: ctrl.type,
      name: ctrl.name,
      offset: off,
      parent,
      texture,
      dims: ints.filter((value) => value >= 1 && value <= 4096).slice(0, 4),
      positions: ints.filter((value) => (value >= -20000 && value <= 20000) || value === -9999).slice(0, 8),
    });
    off = Math.max(next, ctrl.fieldsStart + 1);
  }
  return controls;
}

function groupControls(controls: XdatControl[]) {
  const byWindow: Record<string, XdatControl[]> = {};
  const controlTypes: Record<string, number> = {};
  let texturedControls = 0;

  for (const control of controls) {
    controlTypes[control.type] = (controlTypes[control.type] ?? 0) + 1;
    if (control.texture) texturedControls++;
    if (!control.parent) continue;
    (byWindow[control.parent] ??= []).push(control);
  }

  return {
    byWindow,
    summary: {
      controls: controls.length,
      windows: Object.keys(byWindow).length,
      texturedControls,
      controlTypes,
    },
  };
}

function controlAt(bytes: Uint8Array, off: number): ControlStart | null {
  const type = readControlString(bytes, off);
  if (!type || !XDAT_CONTROL_TYPES.has(type.text)) return null;
  const name = readControlString(bytes, type.next);
  if (!name) return null;
  return { type: type.text, name: name.text, fieldsStart: name.next };
}

function tokenizeFields(bytes: Uint8Array, start: number, end: number): Token[] {
  const tokens: Token[] = [];
  let off = start;
  while (off < end) {
    const str = readControlString(bytes, off);
    if (str && str.text.length >= 2) {
      tokens.push({ kind: "string", value: str.text, offset: off });
      off = str.next;
    } else if (off + 4 <= end) {
      tokens.push({ kind: "int32", value: readI32(bytes, off), offset: off });
      off += 4;
    } else {
      off += 1;
    }
  }
  return tokens;
}

function readLenString(bytes: Uint8Array, off: number): LenString | null {
  if (off >= bytes.length) return null;
  const len = bytes[off];
  if (len <= 0 || off + 1 + len > bytes.length) return null;
  const raw = bytes.subarray(off + 1, off + 1 + len);
  const nul = raw.indexOf(0);
  const text = decoder.decode(raw.subarray(0, nul === -1 ? raw.length : nul));
  if (!/^[\x20-\x7e]*$/.test(text)) return null;
  return { text, next: off + 1 + len, length: len };
}

function readControlString(bytes: Uint8Array, off: number): LenString | null {
  if (off < 0 || off + 1 > bytes.length) return null;
  const len = bytes[off];
  if (len < 1 || off + 1 + len > bytes.length) return null;
  let raw = bytes.subarray(off + 1, off + 1 + len);
  if (raw.length && raw[raw.length - 1] === 0) raw = raw.subarray(0, raw.length - 1);
  const text = decoder.decode(raw);
  if (!/^[\x20-\x7e]+$/.test(text)) return null;
  return { text, next: off + 1 + len, length: len };
}

function looksLikeTextureRef(value: string): boolean {
  return value.includes(".") || /l2/i.test(value);
}

function readU32(bytes: Uint8Array, off: number): number {
  if (off + 4 > bytes.length) return 0;
  return new DataView(bytes.buffer, bytes.byteOffset + off, 4).getUint32(0, true);
}

function readI32(bytes: Uint8Array, off: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + off, 4).getInt32(0, true);
}
