import { Readable } from 'node:stream';
import { createInflateRaw } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { describe, expect, it } from 'vitest';
import { createZipStream, type ZipEntrySource } from '../lib/zipStream.js';

const collectStream = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
};

const readableFrom = (data: string | Buffer): Readable =>
  Readable.from([typeof data === 'string' ? Buffer.from(data) : data]);

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_HEADER_SIG = 0x02014b50;
const END_OF_CENTRAL_DIR_SIG = 0x06054b50;
const DATA_DESCRIPTOR_SIG = 0x08074b50;

const parseEndOfCentralDir = (buf: Buffer) => {
  let offset = buf.length - 22;
  while (offset >= 0) {
    if (buf.readUInt32LE(offset) === END_OF_CENTRAL_DIR_SIG) {
      return {
        totalEntries: buf.readUInt16LE(offset + 10),
        centralDirSize: buf.readUInt32LE(offset + 12),
        centralDirOffset: buf.readUInt32LE(offset + 16)
      };
    }
    offset--;
  }
  throw new Error('End of central directory not found');
};

const parseCentralDirEntries = (buf: Buffer, eocd: { centralDirOffset: number; totalEntries: number }) => {
  const entries: Array<{
    name: string;
    method: number;
    crc32: number;
    compressedSize: number;
    uncompressedSize: number;
    localHeaderOffset: number;
  }> = [];

  let offset = eocd.centralDirOffset;
  for (let i = 0; i < eocd.totalEntries; i++) {
    expect(buf.readUInt32LE(offset)).toBe(CENTRAL_DIR_HEADER_SIG);
    const method = buf.readUInt16LE(offset + 10);
    const crc32 = buf.readUInt32LE(offset + 16);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const uncompressedSize = buf.readUInt32LE(offset + 24);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);
    const name = buf.subarray(offset + 46, offset + 46 + nameLength).toString('utf-8');
    entries.push({ name, method, crc32, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
};

const extractFileData = (zipBuf: Buffer, localHeaderOffset: number, compressedSize: number): Buffer => {
  const nameLength = zipBuf.readUInt16LE(localHeaderOffset + 26);
  const extraLength = zipBuf.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + nameLength + extraLength;
  return zipBuf.subarray(dataStart, dataStart + compressedSize);
};

const inflateRaw = async (data: Buffer): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  const inflate = createInflateRaw();
  inflate.on('data', (chunk: Buffer) => chunks.push(chunk));
  await pipeline(Readable.from([data]), inflate);
  return Buffer.concat(chunks);
};

describe('createZipStream', () => {
  it('creates a valid zip with a single stored entry', async () => {
    const content = 'hello world';
    const entries: ZipEntrySource[] = [
      { name: 'hello.txt', getStream: async () => readableFrom(content) }
    ];

    const zipBuf = await collectStream(createZipStream(entries));
    const eocd = parseEndOfCentralDir(zipBuf);

    expect(eocd.totalEntries).toBe(1);

    const cdEntries = parseCentralDirEntries(zipBuf, eocd);
    expect(cdEntries).toHaveLength(1);
    expect(cdEntries[0]!.name).toBe('hello.txt');
    expect(cdEntries[0]!.method).toBe(0); // STORE
    expect(cdEntries[0]!.uncompressedSize).toBe(content.length);
    expect(cdEntries[0]!.compressedSize).toBe(content.length);

    const data = extractFileData(zipBuf, cdEntries[0]!.localHeaderOffset, cdEntries[0]!.compressedSize);
    expect(data.toString()).toBe(content);
  });

  it('creates a valid zip with multiple entries', async () => {
    const entries: ZipEntrySource[] = [
      { name: 'a.txt', getStream: async () => readableFrom('aaa') },
      { name: 'sub/b.txt', getStream: async () => readableFrom('bbb') },
      { name: 'sub/deep/c.txt', getStream: async () => readableFrom('ccc') }
    ];

    const zipBuf = await collectStream(createZipStream(entries));
    const eocd = parseEndOfCentralDir(zipBuf);

    expect(eocd.totalEntries).toBe(3);

    const cdEntries = parseCentralDirEntries(zipBuf, eocd);
    expect(cdEntries.map((e) => e.name)).toEqual(['a.txt', 'sub/b.txt', 'sub/deep/c.txt']);

    for (const entry of cdEntries) {
      const data = extractFileData(zipBuf, entry.localHeaderOffset, entry.compressedSize);
      expect(data.length).toBe(entry.uncompressedSize);
    }
  });

  it('creates a valid zip with deflate compression', async () => {
    const content = 'abcdef'.repeat(200);
    const entries: ZipEntrySource[] = [
      { name: 'repeated.txt', getStream: async () => readableFrom(content) }
    ];

    const zipBuf = await collectStream(createZipStream(entries, { compress: true, level: 6 }));
    const eocd = parseEndOfCentralDir(zipBuf);
    const cdEntries = parseCentralDirEntries(zipBuf, eocd);

    expect(cdEntries).toHaveLength(1);
    expect(cdEntries[0]!.method).toBe(8); // DEFLATE
    expect(cdEntries[0]!.uncompressedSize).toBe(content.length);
    expect(cdEntries[0]!.compressedSize).toBeLessThan(content.length);

    const compressedData = extractFileData(zipBuf, cdEntries[0]!.localHeaderOffset, cdEntries[0]!.compressedSize);
    const decompressed = await inflateRaw(compressedData);
    expect(decompressed.toString()).toBe(content);
  });

  it('handles an empty entry list', async () => {
    const zipBuf = await collectStream(createZipStream([]));
    const eocd = parseEndOfCentralDir(zipBuf);

    expect(eocd.totalEntries).toBe(0);
    expect(eocd.centralDirSize).toBe(0);
  });

  it('handles binary content', async () => {
    const binaryData = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x80, 0x7f]);
    const entries: ZipEntrySource[] = [
      { name: 'binary.bin', getStream: async () => readableFrom(binaryData) }
    ];

    const zipBuf = await collectStream(createZipStream(entries));
    const eocd = parseEndOfCentralDir(zipBuf);
    const cdEntries = parseCentralDirEntries(zipBuf, eocd);

    expect(cdEntries[0]!.uncompressedSize).toBe(binaryData.length);

    const data = extractFileData(zipBuf, cdEntries[0]!.localHeaderOffset, cdEntries[0]!.compressedSize);
    expect(Buffer.compare(data, binaryData)).toBe(0);
  });

  it('encodes utf-8 filenames', async () => {
    const entries: ZipEntrySource[] = [
      { name: 'café/résumé.txt', getStream: async () => readableFrom('data') }
    ];

    const zipBuf = await collectStream(createZipStream(entries));
    const cdEntries = parseCentralDirEntries(zipBuf, parseEndOfCentralDir(zipBuf));

    expect(cdEntries[0]!.name).toBe('café/résumé.txt');
  });

  it('produces consistent crc32 between local data descriptor and central directory', async () => {
    const entries: ZipEntrySource[] = [
      { name: 'test.txt', getStream: async () => readableFrom('test data for crc check') }
    ];

    const zipBuf = await collectStream(createZipStream(entries));
    const cdEntries = parseCentralDirEntries(zipBuf, parseEndOfCentralDir(zipBuf));
    const entry = cdEntries[0]!;

    // Find data descriptor after stored data
    const nameLength = zipBuf.readUInt16LE(entry.localHeaderOffset + 26);
    const dataStart = entry.localHeaderOffset + 30 + nameLength;
    const descriptorOffset = dataStart + entry.compressedSize;

    expect(zipBuf.readUInt32LE(descriptorOffset)).toBe(DATA_DESCRIPTOR_SIG);
    const descriptorCrc = zipBuf.readUInt32LE(descriptorOffset + 4);
    const descriptorCompressed = zipBuf.readUInt32LE(descriptorOffset + 8);
    const descriptorUncompressed = zipBuf.readUInt32LE(descriptorOffset + 12);

    expect(descriptorCrc).toBe(entry.crc32);
    expect(descriptorCompressed).toBe(entry.compressedSize);
    expect(descriptorUncompressed).toBe(entry.uncompressedSize);
  });

  it('destroys output stream when a source stream errors', async () => {
    const entries: ZipEntrySource[] = [
      {
        name: 'fail.txt',
        getStream: async () => {
          const stream = new Readable({
            read() {
              this.destroy(new Error('source read error'));
            }
          });
          return stream;
        }
      }
    ];

    const zipStream = createZipStream(entries);

    await expect(collectStream(zipStream)).rejects.toThrow('source read error');
  });
});
