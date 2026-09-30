import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

/**
 * Renders a QR to a canvas.
 *
 * Deliberately high contrast (pure black on pure white, wide quiet zone) and
 * error-correction level M: the scanning phone is reading this off a glossy
 * screen at an angle under bad lighting, which is the hardest realistic case.
 */
export function QrCode({ value, size = 260, className = '' }) {
  const canvasRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!value || !canvasRef.current) return;
    let cancelled = false;

    QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#FFFFFF' },
    })
      .then(() => !cancelled && setError(null))
      .catch((err) => !cancelled && setError(err.message));

    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (error) {
    return (
      <div
        className={`flex items-center justify-center rounded-2xl bg-danger-500/10 p-6 text-center text-xs text-danger-400 ${className}`}
        style={{ width: size, height: size }}
      >
        Could not render QR code.
      </div>
    );
  }

  return <canvas ref={canvasRef} className={`rounded-xl ${className}`} aria-label="UniPay student QR code" />;
}
