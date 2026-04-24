import { createHash } from 'node:crypto';
import { PassThrough, Readable, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createDeflateRaw, constants as zlibConstants } from 'node:zlib';

/**
 * Minimal streaming ZIP archive writer using only Node.js built-ins.
 * Supports deflate compression via node:zlib and store (no compression).
 * Uses data descriptors (General Purpose Bit 3) so CRC/sizes are written
 * after file data, enabling streaming of files with unknown sizes.
 */

/** Bit 3 = data descriptor follows; Bit 11 = UTF-8 filenames. */
const GP_FLAGS = (1 << 3) | (1 << 11);
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;
const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_HEADER_SIG = 0x02014b50;
const END_OF_CENTRAL_DIR_SIG = 0x06054b50;
const DATA_DESCRIPTOR_SIG = 0x08074b50;
const VERSION_NEEDED = 20; // 2.0
const VERSION_MADE_BY = 0x033f; // Unix, spec 6.3

const dosDateTime = (date: Date): { date: number; time: number } => {
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return {
    time: (hours << 11) | (minutes << 5) | (seconds >>> 1),
    date: (Math.max(year - 1980, 0) << 9) | (month << 5) | day
  };
};

interface CentralEntry {
  name: Buffer;
  method: number;
  dosTime: number;
  dosDate: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

const crc32Update = (crc: number, buf: Buffer): number => {
  let c = crc ^ 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crc32Table[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

export interface ZipStreamOptions {
  compress?: boolean;
  level?: number;
}

export interface ZipEntrySource {
  name: string;
  getStream: () => Promise<Readable>;
}

/**
 * Creates a ZIP archive as a Readable stream from the given entries.
 * Each entry is read lazily (one at a time) to keep memory usage low.
 */
export const createZipStream = (
  entries: ZipEntrySource[],
  options?: ZipStreamOptions
): Readable => {
  const output = new PassThrough();
  const compress = options?.compress ?? false;
  const level = options?.level ?? 6;

  void writeZipToStream(output, entries, compress, level).catch((error) => {
    output.destroy(error instanceof Error ? error : new Error(String(error)));
  });

  return output;
};

const writeZipToStream = async (
  output: Writable,
  entries: ZipEntrySource[],
  compress: boolean,
  level: number
): Promise<void> => {
  const centralEntries: CentralEntry[] = [];
  let offset = 0;

  const write = (buf: Buffer): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      if (output.write(buf)) {
        resolve();
      } else {
        output.once('drain', resolve);
        output.once('error', reject);
      }
    });

  const now = new Date();
  const dos = dosDateTime(now);
  const method = compress ? METHOD_DEFLATE : METHOD_STORE;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf-8');
    const localHeaderOffset = offset;

    // Local file header (30 bytes + name)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIG, 0);
    localHeader.writeUInt16LE(VERSION_NEEDED, 4);
    localHeader.writeUInt16LE(GP_FLAGS, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dos.time, 10);
    localHeader.writeUInt16LE(dos.date, 12);
    // CRC/sizes = 0 here (data descriptor follows)
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    // Extra field length = 0

    await write(localHeader);
    await write(nameBuffer);
    offset += 30 + nameBuffer.length;

    // Stream file data, computing CRC-32 and sizes
    const sourceStream = await entry.getStream();
    let crc = 0;
    let uncompressedSize = 0;
    let compressedSize = 0;

    if (compress) {
      // Collect source data, compute CRC, then deflate
      const sourceChunks: Buffer[] = [];
      for await (const chunk of sourceStream) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        crc = crc32Update(crc, buf);
        uncompressedSize += buf.length;
        sourceChunks.push(buf);
      }

      const uncompressedData = Buffer.concat(sourceChunks);
      const deflate = createDeflateRaw({ level });
      const compressedChunks: Buffer[] = [];
      const collector = new PassThrough();
      collector.on('data', (chunk: Buffer) => compressedChunks.push(chunk));

      await pipeline(Readable.from([uncompressedData]), deflate, collector);

      const compressedData = Buffer.concat(compressedChunks);
      compressedSize = compressedData.length;
      await write(compressedData);
      offset += compressedSize;
    } else {
      // Store: write chunks directly, compute CRC inline
      for await (const chunk of sourceStream) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        crc = crc32Update(crc, buf);
        uncompressedSize += buf.length;
        compressedSize += buf.length;
        await write(buf);
        offset += buf.length;
      }
    }

    // Data descriptor (16 bytes with signature)
    const dataDescriptor = Buffer.alloc(16);
    dataDescriptor.writeUInt32LE(DATA_DESCRIPTOR_SIG, 0);
    dataDescriptor.writeUInt32LE(crc, 4);
    dataDescriptor.writeUInt32LE(compressedSize, 8);
    dataDescriptor.writeUInt32LE(uncompressedSize, 12);
    await write(dataDescriptor);
    offset += 16;

    centralEntries.push({
      name: nameBuffer,
      method,
      dosTime: dos.time,
      dosDate: dos.date,
      crc32: crc,
      compressedSize,
      uncompressedSize,
      localHeaderOffset
    });
  }

  // Central directory
  const centralDirOffset = offset;
  for (const entry of centralEntries) {
    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(CENTRAL_DIR_HEADER_SIG, 0);
    cdHeader.writeUInt16LE(VERSION_MADE_BY, 4);
    cdHeader.writeUInt16LE(VERSION_NEEDED, 6);
    cdHeader.writeUInt16LE(GP_FLAGS, 8);
    cdHeader.writeUInt16LE(entry.method, 10);
    cdHeader.writeUInt16LE(entry.dosTime, 12);
    cdHeader.writeUInt16LE(entry.dosDate, 14);
    cdHeader.writeUInt32LE(entry.crc32, 16);
    cdHeader.writeUInt32LE(entry.compressedSize, 20);
    cdHeader.writeUInt32LE(entry.uncompressedSize, 24);
    cdHeader.writeUInt16LE(entry.name.length, 28);
    // Extra field length = 0 (offset 30)
    // File comment length = 0 (offset 32)
    // Disk number start = 0 (offset 34)
    // Internal file attributes = 0 (offset 36)
    cdHeader.writeUInt32LE((0o100664 << 16) >>> 0, 38); // External file attributes (Unix mode)
    cdHeader.writeUInt32LE(entry.localHeaderOffset, 42);

    await write(cdHeader);
    await write(entry.name);
    offset += 46 + entry.name.length;
  }

  const centralDirSize = offset - centralDirOffset;

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(END_OF_CENTRAL_DIR_SIG, 0);
  // Disk number = 0 (offset 4)
  // Disk with central dir = 0 (offset 6)
  eocd.writeUInt16LE(centralEntries.length, 8);
  eocd.writeUInt16LE(centralEntries.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  // Comment length = 0 (offset 20)

  await write(eocd);
  output.end();
};
