import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Spinner } from './Brand.jsx';

const REGION_ID = 'unipay-qr-region';

/**
 * Camera QR scanner for the merchant POS.
 *
 * Two environment realities this component has to handle honestly:
 *
 * 1. getUserMedia only exists in a SECURE CONTEXT. On a phone, plain
 *    http://192.168.x.x is NOT secure, so the camera is blocked by the browser
 *    — not by us. Rather than showing a dead black box, we detect it and tell
 *    the user exactly which of the two documented workarounds to use, and offer
 *    manual entry so the demo never hard-stops.
 *
 * 2. Permission can be denied or the camera can be held by another app. Both
 *    get their own message.
 */
export function QrScanner({ onScan, onError, paused = false }) {
  const scannerRef = useRef(null);
  const startedRef = useRef(false);
  // Guards against the decoder firing the same code many times per second while
  // the QR is still in frame.
  const lastScanRef = useRef({ text: null, at: 0 });

  const [status, setStatus] = useState('starting'); // starting | scanning | error
  const [errorInfo, setErrorInfo] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [cameraIndex, setCameraIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      // --- Secure-context gate ---
      const isSecure = window.isSecureContext || ['localhost', '127.0.0.1'].includes(window.location.hostname);
      if (!isSecure) {
        setStatus('error');
        setErrorInfo({
          kind: 'INSECURE',
          title: 'Camera needs a secure connection',
          detail:
            'Android blocks the camera on plain http:// addresses. Open UniPay through the tunnel URL (https), or enable this origin in chrome://flags → "Insecure origins treated as secure".',
        });
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error');
        setErrorInfo({ kind: 'UNSUPPORTED', title: 'Camera not available', detail: 'This browser does not expose a camera API.' });
        return;
      }

      try {
        const devices = await Html5Qrcode.getCameras();
        if (cancelled) return;

        if (!devices?.length) {
          setStatus('error');
          setErrorInfo({ kind: 'NO_CAMERA', title: 'No camera found', detail: 'This device has no usable camera.' });
          return;
        }

        setCameras(devices);
        // Prefer the rear camera — a merchant scans away from themselves.
        const rearIndex = devices.findIndex((d) => /back|rear|environment/i.test(d.label));
        const chosen = cameraIndex || (rearIndex >= 0 ? rearIndex : 0);
        setCameraIndex(chosen);

        const scanner = new Html5Qrcode(REGION_ID, { verbose: false });
        scannerRef.current = scanner;

        await scanner.start(
          devices[chosen]?.id ?? { facingMode: 'environment' },
          {
            fps: 12,
            qrbox: (vw, vh) => {
              const edge = Math.floor(Math.min(vw, vh) * 0.72);
              return { width: edge, height: edge };
            },
            aspectRatio: 1,
          },
          (decodedText) => {
            const now = Date.now();
            // Same code within 2.5s is a repeat read, not a new scan.
            if (lastScanRef.current.text === decodedText && now - lastScanRef.current.at < 2500) return;
            lastScanRef.current = { text: decodedText, at: now };
            onScan?.(decodedText);
          },
          () => {
            /* per-frame "no QR in view" — normal, and far too noisy to surface */
          }
        );

        if (cancelled) {
          await scanner.stop().catch(() => {});
          return;
        }
        startedRef.current = true;
        setStatus('scanning');
      } catch (err) {
        if (cancelled) return;
        const name = err?.name ?? '';
        const denied = name === 'NotAllowedError' || /permission/i.test(String(err?.message));
        const busy = name === 'NotReadableError' || name === 'TrackStartError';

        setStatus('error');
        setErrorInfo({
          kind: denied ? 'DENIED' : busy ? 'BUSY' : 'FAILED',
          title: denied ? 'Camera permission denied' : busy ? 'Camera is in use' : 'Could not start the camera',
          detail: denied
            ? 'Allow camera access for this site in your browser settings, then try again.'
            : busy
              ? 'Close any other app or tab using the camera and try again.'
              : String(err?.message ?? err),
        });
        onError?.(err);
      }
    }

    start();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      if (scanner && startedRef.current) {
        // stop() rejects if the scanner already stopped; that is not an error
        // worth surfacing during unmount.
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {});
        startedRef.current = false;
      }
      scannerRef.current = null;
    };
    // cameraIndex intentionally drives a full restart when the user flips camera.
  }, [cameraIndex, onScan, onError]);

  // Pause decoding (e.g. while the amount sheet is open) without tearing the
  // camera down — restarting it takes a second and looks broken on stage.
  useEffect(() => {
    const scanner = scannerRef.current;
    if (!scanner || !startedRef.current) return;
    try {
      if (paused) scanner.pause(true);
      else scanner.resume();
    } catch {
      /* pause/resume throws if the scanner is mid-transition; harmless */
    }
  }, [paused, status]);

  const flipCamera = () => {
    if (cameras.length < 2) return;
    setCameraIndex((i) => (i + 1) % cameras.length);
    setStatus('starting');
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/12 bg-black">
      <div id={REGION_ID} className="min-h-[300px] w-full [&_video]:!w-full [&_video]:!object-cover" />

      {status === 'scanning' && (
        <>
          {/* Reticle */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-[72%] w-[72%] max-w-[300px]">
              {['-top-px -left-px border-l-4 border-t-4 rounded-tl-xl', '-top-px -right-px border-r-4 border-t-4 rounded-tr-xl', '-bottom-px -left-px border-l-4 border-b-4 rounded-bl-xl', '-bottom-px -right-px border-r-4 border-b-4 rounded-br-xl'].map(
                (pos) => (
                  <span key={pos} className={`absolute h-9 w-9 border-mint-400 ${pos}`} />
                )
              )}
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-4 pt-10 text-center">
            <p className="text-sm font-bold text-white">Point at the student's UniPay QR</p>
            <p className="mt-0.5 text-[11px] text-slate-400">Detection is automatic</p>
          </div>
          {cameras.length > 1 && (
            <button
              type="button"
              onClick={flipCamera}
              className="absolute right-3 top-3 rounded-full bg-black/60 p-2.5 text-white backdrop-blur transition hover:bg-black/80"
              aria-label="Switch camera"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" />
                <path d="m9 9-3 3 3 3M15 15l3-3-3-3" />
              </svg>
            </button>
          )}
        </>
      )}

      {status === 'starting' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink-900 text-slate-400">
          <Spinner className="h-7 w-7 text-brand-400" />
          <p className="text-sm font-semibold">Starting camera…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink-900 px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-500/15 text-danger-400">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
          </div>
          <p className="text-sm font-bold text-white">{errorInfo?.title}</p>
          <p className="max-w-xs text-xs leading-relaxed text-slate-400">{errorInfo?.detail}</p>
        </div>
      )}
    </div>
  );
}
