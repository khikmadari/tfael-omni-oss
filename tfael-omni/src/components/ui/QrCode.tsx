// ═══════════════════════════════════════════════════════════════════════
// TFAEL-OMNI — Kode QR sebagai SVG
// Dibangkitkan sepenuhnya di peramban (tanpa permintaan ke layanan luar).
// ═══════════════════════════════════════════════════════════════════════

import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

interface QrCodeProps {
  /** Teks yang disandikan, biasanya sebuah URL. */
  value: string;
  /** Ukuran sisi dalam piksel. */
  size?: number;
  /** Keterangan untuk pembaca layar. */
  label?: string;
  className?: string;
}

// Zona tenang di sekeliling kode, dalam satuan modul. Pemindai butuh tepi kosong agar kode terbaca.
const QUIET = 3;

/** Modul gelap di atas latar putih (kontras tinggi) supaya mudah dipindai dari layar. */
export function QrCode({ value, size = 120, label = 'Kode QR', className }: QrCodeProps) {
  const { count, path } = useMemo(() => {
    const qr = qrcode(0, 'M'); // 0 = versi dipilih otomatis; M = koreksi galat ±15%
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
      }
    }
    return { count: n, path: d };
  }, [value]);

  const side = count + QUIET * 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-QUIET} ${-QUIET} ${side} ${side}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      className={className}
    >
      <rect x={-QUIET} y={-QUIET} width={side} height={side} fill="#ffffff" />
      <path d={path} fill="#141109" />
    </svg>
  );
}
