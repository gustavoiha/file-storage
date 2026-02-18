declare module 'heic-convert' {
  type HeicConvertFormat = 'JPEG' | 'PNG';

  interface HeicConvertOptions {
    buffer: Buffer | Uint8Array | ArrayBuffer;
    format: HeicConvertFormat;
    quality?: number;
  }

  const convert: (options: HeicConvertOptions) => Promise<Buffer | Uint8Array | ArrayBuffer>;
  export default convert;
}
