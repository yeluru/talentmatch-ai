/**
 * Replace only word/document.xml in a DOCX (ZIP) and leave every other entry byte-for-byte identical.
 * No recompression of other entries, no added XML declaration — target = source with filled values only.
 */

const LOCAL_HEADER_SIG = 0x04034b50;

/** CRC-32 (ZIP/gzip polynomial). Seed with 0; result must be >>> 0 for ZIP header. */
function crc32(data: Uint8Array, seed = 0): number {
  let crc = seed ^ 0xffffffff;
  const table = getCrc32Table();
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
let _crc32Table: Uint32Array | null = null;
function getCrc32Table(): Uint32Array {
  if (_crc32Table) return _crc32Table;
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  _crc32Table = t;
  return t;
}

const CENTRAL_HEADER_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const DOCUMENT_XML_PATH = "word/document.xml";

export type CdEntry = {
  name: string;
  localHeaderOffset: number;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  compression: number;
  header46: Uint8Array;
  filenameLen: number;
  extraLen: number;
  commentLen: number;
  filename: Uint8Array;
  extraAndComment: Uint8Array;
};

export function parseZipCentralDirectory(u8: Uint8Array): {
  eocdOff: number;
  centralDirOffset: number;
  centralDirSize: number;
  totalEntries: number;
  commentLen: number;
  entries: CdEntry[];
} {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const searchEnd = Math.min(u8.length, 65557);
  let eocdOff = -1;
  for (let i = u8.length - 4; i >= u8.length - searchEnd && i >= 0; i--) {
    if (dv.getUint32(i, true) === EOCD_SIG) {
      eocdOff = i;
      break;
    }
  }
  if (eocdOff < 0) throw new Error("DOCX: invalid zip (no EOCD)");
  const centralDirOffset = dv.getUint32(eocdOff + 16, true);
  const centralDirSize = dv.getUint32(eocdOff + 12, true);
  const totalEntries = dv.getUint16(eocdOff + 8, true);
  const commentLen = dv.getUint16(eocdOff + 20, true);

  const entries: CdEntry[] = [];
  let cdPos = centralDirOffset;
  const cdEnd = centralDirOffset + centralDirSize;
  while (cdPos + 46 <= cdEnd) {
    if (dv.getUint32(cdPos, true) !== CENTRAL_HEADER_SIG) break;
    const compression = dv.getUint16(cdPos + 10, true);
    const crc = dv.getUint32(cdPos + 16, true);
    const compSize = dv.getUint32(cdPos + 20, true);
    const uncompSize = dv.getUint32(cdPos + 24, true);
    const fnLen = dv.getUint16(cdPos + 28, true);
    const exLen = dv.getUint16(cdPos + 30, true);
    const cmLen = dv.getUint16(cdPos + 32, true);
    const localOff = dv.getUint32(cdPos + 42, true);
    const header46 = u8.slice(cdPos, cdPos + 46);
    const filename = u8.slice(cdPos + 46, cdPos + 46 + fnLen);
    const extraAndComment = u8.slice(cdPos + 46 + fnLen, cdPos + 46 + fnLen + exLen + cmLen);
    entries.push({
      name: new TextDecoder().decode(filename),
      localHeaderOffset: localOff,
      compressedSize: compSize,
      uncompressedSize: uncompSize,
      crc32: crc,
      compression,
      header46,
      filenameLen: fnLen,
      extraLen: exLen,
      commentLen: cmLen,
      filename,
      extraAndComment,
    });
    cdPos += 46 + fnLen + exLen + cmLen;
  }
  if (entries.length !== totalEntries) throw new Error("DOCX: central directory entry count mismatch");
  return { eocdOff, centralDirOffset, centralDirSize, totalEntries, commentLen, entries };
}

export function concatU8(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

/** Read word/document.xml from DOCX as string (decompress only that entry). */
export function getDocumentXmlString(
  docxBytes: Uint8Array,
  fflate: { inflateSync: (data: Uint8Array) => Uint8Array }
): string {
  const { entries } = parseZipCentralDirectory(docxBytes);
  const docEntry = entries.find((e) => e.name === DOCUMENT_XML_PATH);
  if (!docEntry) throw new Error("DOCX missing word/document.xml");
  const u8 = docxBytes;
  const localOff = docEntry.localHeaderOffset;
  const localHeaderLen = 30 + docEntry.filenameLen + docEntry.extraLen;
  const compData = u8.subarray(localOff + localHeaderLen, localOff + localHeaderLen + docEntry.compressedSize);
  let uncomp: Uint8Array;
  if (docEntry.compression === 0) {
    uncomp = compData.slice();
  } else if (docEntry.compression === 8) {
    uncomp = fflate.inflateSync(compData);
  } else {
    throw new Error(`DOCX: unsupported compression ${docEntry.compression} for word/document.xml`);
  }
  return new TextDecoder().decode(uncomp);
}

export async function replaceDocumentXmlInDocx(
  docxBytes: Uint8Array,
  newDocumentXml: string,
  fflate: { inflateSync: (data: Uint8Array) => Uint8Array; deflateSync: (data: Uint8Array, opts?: { level: number }) => Uint8Array }
): Promise<Uint8Array> {
  const u8 = docxBytes;
  const { inflateSync, deflateSync } = fflate;
  const { eocdOff, centralDirOffset, totalEntries, commentLen, entries } = parseZipCentralDirectory(u8);

  const docEntry = entries.find((e) => e.name === DOCUMENT_XML_PATH);
  if (!docEntry) throw new Error("DOCX missing word/document.xml");

  const sortedEntries = [...entries].sort((a, b) => a.localHeaderOffset - b.localHeaderOffset);
  const newOffsets = new Map<string, number>();
  const newSizes = new Map<string, { compressed: number; uncompressed: number; crc: number }>();

  const outChunks: Uint8Array[] = [];
  let outOffset = 0;

  for (const ent of sortedEntries) {
    const localOff = ent.localHeaderOffset;
    const localHeaderLen = 30 + ent.filenameLen + ent.extraLen;
    const compData = u8.subarray(localOff + localHeaderLen, localOff + localHeaderLen + ent.compressedSize);

    if (ent.name !== DOCUMENT_XML_PATH) {
      outChunks.push(u8.subarray(localOff, localOff + localHeaderLen + ent.compressedSize));
      newOffsets.set(ent.name, outOffset);
      outOffset += localHeaderLen + ent.compressedSize;
      continue;
    }

    let uncomp: Uint8Array;
    if (ent.compression === 0) {
      uncomp = compData.slice();
    } else if (ent.compression === 8) {
      uncomp = inflateSync(compData);
    } else {
      throw new Error(`DOCX: unsupported compression ${ent.compression} for word/document.xml`);
    }
    const newUncomp = new TextEncoder().encode(newDocumentXml);
    const newComp = deflateSync(newUncomp, { level: 6 }).slice();
    const newCrc = crc32(newUncomp);

    const localHeader = new Uint8Array(30 + ent.filenameLen + ent.extraLen);
    localHeader.set(u8.subarray(localOff, localOff + 30));
    const lhView = new DataView(localHeader.buffer, localHeader.byteOffset, localHeader.byteLength);
    lhView.setUint32(14, newCrc >>> 0, true);
    lhView.setUint32(18, newComp.length, true);
    lhView.setUint32(22, newUncomp.length, true);
    lhView.setUint16(6, 0, true);
    if (ent.filenameLen) localHeader.set(ent.filename, 30);
    if (ent.extraLen) localHeader.set(u8.subarray(localOff + 30 + ent.filenameLen, localOff + 30 + ent.filenameLen + ent.extraLen), 30 + ent.filenameLen);

    outChunks.push(localHeader, newComp);
    newOffsets.set(ent.name, outOffset);
    newSizes.set(ent.name, { compressed: newComp.length, uncompressed: newUncomp.length, crc: newCrc >>> 0 });
    outOffset += localHeader.length + newComp.length;
  }

  const centralDirParts: Uint8Array[] = [];
  let cdBytePos = centralDirOffset;
  for (const e of entries) {
    const no = newOffsets.get(e.name)!;
    const ns = newSizes.get(e.name);
    const h = e.header46.slice();
    const hView = new DataView(h.buffer, h.byteOffset, h.byteLength);
    hView.setUint32(42, no, true);
    if (ns) {
      hView.setUint32(16, ns.crc, true);
      hView.setUint32(20, ns.compressed, true);
      hView.setUint32(24, ns.uncompressed, true);
    }
    centralDirParts.push(h, e.filename, e.extraAndComment);
  }
  const newCentralDir = concatU8(centralDirParts);

  const newEocd = new ArrayBuffer(22 + commentLen);
  const eocdView = new DataView(newEocd);
  eocdView.setUint32(0, EOCD_SIG, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, totalEntries, true);
  eocdView.setUint16(10, totalEntries, true);
  eocdView.setUint32(12, newCentralDir.length, true);
  eocdView.setUint32(16, outOffset, true);
  eocdView.setUint16(20, commentLen, true);
  const eocdBytes = new Uint8Array(newEocd);
  if (commentLen > 0) eocdBytes.set(u8.subarray(eocdOff + 22, eocdOff + 22 + commentLen), 22);

  return concatU8([...outChunks, newCentralDir, eocdBytes]);
}
