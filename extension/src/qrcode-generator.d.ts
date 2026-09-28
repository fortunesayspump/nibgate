declare module 'qrcode-generator' {
  interface QrCode {
    addData(data: string): void;
    make(): void;
    createSvgTag(options?: { cellSize?: number; margin?: number; scalable?: boolean; alt?: string; title?: string }): string;
    createImgTag(options?: { cellSize?: number; margin?: number; alt?: string }): string;
  }
  export default function qrcode(typeNumber: number, errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H'): QrCode;
}
