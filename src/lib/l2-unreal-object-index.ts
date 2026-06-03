import { L2Package, type RefTarget, type UExport } from "./l2-package";

const RF_HAS_STACK = 0x02000000;

const PROPERTY_TYPES: Record<number, UnrealPropertyType> = {
  0x00: "None",
  0x01: "Byte",
  0x02: "Int",
  0x03: "Bool",
  0x04: "Float",
  0x05: "Object",
  0x06: "Name",
  0x09: "Array",
  0x0a: "Struct",
  0x0c: "String",
};

const STATIC_SIZES: Record<number, number> = {
  0x00: 1,
  0x10: 2,
  0x20: 4,
  0x30: 12,
  0x40: 16,
};

export type UnrealPropertyType =
  | "None"
  | "Byte"
  | "Int"
  | "Bool"
  | "Float"
  | "Object"
  | "Name"
  | "Array"
  | "Struct"
  | "String"
  | "Unknown";

export type UnrealPropertyValue =
  | null
  | boolean
  | number
  | string
  | number[]
  | UnrealObjectRef
  | UnrealProperty[];

export interface UnrealObjectRef {
  index: number;
  target: RefTarget;
}

export interface UnrealProperty {
  name: string;
  type: UnrealPropertyType;
  typeId: number;
  offset: number;
  valueOffset: number;
  size: number;
  arrayIndex: number | null;
  structName: string | null;
  value: UnrealPropertyValue;
}

export interface UnrealExportIndexEntry {
  exportIndex: number;
  objectName: string;
  className: string;
  size: number;
  offset: number;
  flags: number;
  refs: UnrealObjectRef[];
  properties: UnrealProperty[];
}

export interface UnrealPackageObjectIndex {
  packageVersion: number;
  encryption: L2Package["encryption"];
  xorKey: number;
  nameCount: number;
  importCount: number;
  exportCount: number;
  classHistogram: Record<string, number>;
  exports: UnrealExportIndexEntry[];
}

interface Cursor {
  o: number;
}

export function buildObjectIndex(pkg: L2Package, opts: { includeClasses?: string[]; maxPropertiesPerExport?: number } = {}): UnrealPackageObjectIndex {
  const include = opts.includeClasses ? new Set(opts.includeClasses) : null;
  const exports: UnrealExportIndexEntry[] = [];
  const classHistogram: Record<string, number> = {};

  pkg.exports.forEach((exp, i) => {
    classHistogram[exp.className] = (classHistogram[exp.className] ?? 0) + 1;
    if (exp.size <= 0) return;
    if (include && !include.has(exp.className)) return;
    const properties = readExportProperties(pkg, exp, { maxProperties: opts.maxPropertiesPerExport });
    const refs = properties.flatMap((p) => collectRefs(p.value));
    exports.push({
      exportIndex: i + 1,
      objectName: exp.objectName,
      className: exp.className,
      size: exp.size,
      offset: exp.offset,
      flags: exp.flags,
      refs,
      properties,
    });
  });

  return {
    packageVersion: pkg.packageVersion,
    encryption: pkg.encryption,
    xorKey: pkg.xorKey,
    nameCount: pkg.names.length,
    importCount: pkg.imports.length,
    exportCount: pkg.exports.length,
    classHistogram,
    exports,
  };
}

export function readExportProperties(
  pkg: L2Package,
  exp: UExport,
  opts: { maxProperties?: number } = {},
): UnrealProperty[] {
  if (exp.size <= 0) return [];
  const b = pkg.bytes;
  const cur: Cursor = { o: exp.offset };
  const end = exp.offset + exp.size;

  if (exp.flags & RF_HAS_STACK) skipStateFrame(pkg, cur, end);
  return readPropertyList(pkg, cur, end, opts.maxProperties ?? 1000);
}

function readPropertyList(pkg: L2Package, cur: Cursor, end: number, maxProperties: number): UnrealProperty[] {
  const props: UnrealProperty[] = [];
  let guard = 0;

  while (cur.o < end && guard++ < maxProperties) {
    const propOffset = cur.o;
    const nameIndex = readCompat32(pkg.bytes, cur);
    const name = nameAt(pkg, nameIndex);
    if (name === "None") break;

    const info = readU8(pkg, cur);
    const typeId = info & 0x0f;
    const type = PROPERTY_TYPES[typeId] ?? "Unknown";
    const sizeCode = info & 0x70;
    const hasArrayIndex = (info & 0x80) !== 0;

    let structName: string | null = null;
    if (type === "Struct") structName = nameAt(pkg, readCompat32(pkg.bytes, cur));

    const size = readPropertySize(pkg, cur, sizeCode);
    let arrayIndex: number | null = null;
    if (hasArrayIndex && type !== "Bool") arrayIndex = readU8(pkg, cur);

    const valueOffset = cur.o;
    const value = type === "Bool" ? hasArrayIndex : readPropertyValue(pkg, type, structName, cur, valueOffset, size);
    if (type !== "Bool") cur.o = valueOffset + size;

    props.push({
      name,
      type,
      typeId,
      offset: propOffset,
      valueOffset,
      size,
      arrayIndex,
      structName,
      value,
    });
  }

  return props;
}

function readPropertyValue(
  pkg: L2Package,
  type: UnrealPropertyType,
  structName: string | null,
  cur: Cursor,
  valueOffset: number,
  size: number,
): UnrealPropertyValue {
  const dv = pkg.dv;
  const b = pkg.bytes;
  const end = valueOffset + size;

  switch (type) {
    case "Byte":
      return size >= 1 ? b[valueOffset] : null;
    case "Int":
      return size >= 4 ? dv.getInt32(valueOffset, true) : null;
    case "Float":
      return size >= 4 ? dv.getFloat32(valueOffset, true) : null;
    case "Object": {
      const local = { o: valueOffset };
      const index = readCompat32(b, local);
      return { index, target: pkg.resolveRefFull(index) };
    }
    case "Name": {
      const local = { o: valueOffset };
      return nameAt(pkg, readCompat32(b, local));
    }
    case "String":
      return readCompactString(pkg, { o: valueOffset }, end);
    case "Array":
      return readArrayValue(pkg, { o: valueOffset }, end);
    case "Struct":
      return readStructValue(pkg, structName, { o: valueOffset }, end);
    case "Unknown":
      return null;
    default:
      return null;
  }
}

function readStructValue(pkg: L2Package, structName: string | null, cur: Cursor, end: number): UnrealPropertyValue {
  if (structName === "Vector") return readFloatTuple(pkg, cur.o, 3, end);
  if (structName === "Rotator") return readIntTuple(pkg, cur.o, 3, end);
  if (structName === "Color") return readByteTuple(pkg, cur.o, 4, end);
  if (structName === "Plane") return readFloatTuple(pkg, cur.o, 4, end);
  if (structName === "Scale") return readFloatTuple(pkg, cur.o, 4, end);

  const nested = readPropertyList(pkg, cur, end, 500);
  return nested.length ? nested : null;
}

function readArrayValue(pkg: L2Package, cur: Cursor, end: number): UnrealPropertyValue {
  if (cur.o >= end) return [];
  const count = readCompat32(pkg.bytes, cur);
  if (count < 0 || count > 100000) return [];

  const values: UnrealProperty[] = [];
  for (let i = 0; i < count && cur.o < end; i++) {
    const nested = readPropertyList(pkg, cur, end, 500);
    if (nested.length === 0) break;
    values.push(...nested);
  }
  return values;
}

function skipStateFrame(pkg: L2Package, cur: Cursor, end: number) {
  const node = readCompat32(pkg.bytes, cur);
  readCompat32(pkg.bytes, cur);
  cur.o += 12;
  if (node !== 0 && cur.o < end) readCompat32(pkg.bytes, cur);
}

function readPropertySize(pkg: L2Package, cur: Cursor, sizeCode: number): number {
  if (sizeCode in STATIC_SIZES) return STATIC_SIZES[sizeCode];
  if (sizeCode === 0x50) return readU8(pkg, cur);
  if (sizeCode === 0x60) return readU16(pkg, cur);
  if (sizeCode === 0x70) return readU32(pkg, cur);
  return 0;
}

function collectRefs(value: UnrealPropertyValue): UnrealObjectRef[] {
  if (!value) return [];
  if (typeof value === "object" && "index" in value && "target" in value) return [value];
  if (Array.isArray(value)) {
    return value.flatMap((v) => {
      if (typeof v === "object" && v && "value" in v) return collectRefs(v.value);
      return [];
    });
  }
  return [];
}

function readFloatTuple(pkg: L2Package, offset: number, count: number, end: number): number[] | null {
  if (offset + count * 4 > end) return null;
  return Array.from({ length: count }, (_, i) => pkg.dv.getFloat32(offset + i * 4, true));
}

function readIntTuple(pkg: L2Package, offset: number, count: number, end: number): number[] | null {
  if (offset + count * 4 > end) return null;
  return Array.from({ length: count }, (_, i) => pkg.dv.getInt32(offset + i * 4, true));
}

function readByteTuple(pkg: L2Package, offset: number, count: number, end: number): number[] | null {
  if (offset + count > end) return null;
  return Array.from({ length: count }, (_, i) => pkg.bytes[offset + i]);
}

function readCompactString(pkg: L2Package, cur: Cursor, end: number): string {
  const len = readCompat32(pkg.bytes, cur);
  if (len === 0) return "";
  if (len > 0) {
    const n = Math.max(0, Math.min(len - 1, end - cur.o));
    const s = new TextDecoder("windows-1252").decode(pkg.bytes.slice(cur.o, cur.o + n));
    cur.o += len;
    return s;
  }
  const chars = Math.max(0, Math.min(-len - 1, Math.floor((end - cur.o) / 2)));
  let out = "";
  for (let i = 0; i < chars; i++) out += String.fromCharCode(pkg.dv.getUint16(cur.o + i * 2, true));
  cur.o += -len * 2;
  return out;
}

function readCompat32(b: Uint8Array, cur: Cursor): number {
  const b0 = b[cur.o++];
  const signed = (b0 & 0x80) !== 0;
  let out = b0 & 0x3f;
  if (b0 & 0x40) {
    let shift = 6;
    for (let i = 1; i < 5; i++) {
      const x = b[cur.o++];
      if (i === 4) out |= (x & 0x1f) << shift;
      else out |= (x & 0x7f) << shift;
      shift += 7;
      if ((x & 0x80) === 0) break;
    }
  }
  return signed ? -out : out;
}

function readU8(pkg: L2Package, cur: Cursor): number {
  return pkg.bytes[cur.o++];
}

function readU16(pkg: L2Package, cur: Cursor): number {
  const v = pkg.dv.getUint16(cur.o, true);
  cur.o += 2;
  return v;
}

function readU32(pkg: L2Package, cur: Cursor): number {
  const v = pkg.dv.getUint32(cur.o, true);
  cur.o += 4;
  return v;
}

function nameAt(pkg: L2Package, index: number): string {
  return index >= 0 && index < pkg.names.length ? pkg.names[index].name : "?";
}
