import QRCodeLib from 'qrcode';

export class QRCode {
  /**
   * Generates a standards-compliant SVG QR Code string.
   * Uses Error Correction Level M and proper quiet zone margins.
   */
  public static generateSVG(text: string, size = 180, margin = 2): string {
    const qr = QRCodeLib.create(text, {
      errorCorrectionLevel: 'M',
    });

    const modCount = qr.modules.size;
    const totalSize = modCount + margin * 2;
    let path = '';

    for (let r = 0; r < modCount; r++) {
      for (let c = 0; c < modCount; c++) {
        if (qr.modules.get(r, c)) {
          const x = c + margin;
          const y = r + margin;
          path += `M${x},${y}h1v1h-1z `;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${size}" height="${size}" shape-rendering="crispEdges">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <path d="${path}" fill="#000000"/>
    </svg>`;
  }
}
