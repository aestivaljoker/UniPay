import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Spinner } from './Brand.jsx';

const REGION_ID = 'unipay-qr-region';

/**
 * Camera QR scanner for the merchant POS.
 *
 * This component has exactly ONE job that is hard: start the camera once and
 * keep it running. Several things make that harder than it looks on Android.
 *
 * 1. getUserMedia only works in a SECURE CONTEXT. Plain http://192.168.x.x is
 *    not one, so the browser blocks the camera. We detect that and say which
 *    documented workaround to use, and manual entry stays available so a demo
 *    can never hard-stop. (On Render you get real HTTPS, so this is moot.)
 *
 * 2. The start sequence must NOT be restarted by React re-renders. An earlier
 *    version had the start effect depend on `cameraIndex` while also *setting*
 *    it, and on the `onScan` callback, which the parent recreated on every
 *    state change. Both caused the effect to tear down an in-flight
 *    getUserMedia, which Android surfaces as a generic "failed to open camera".
 *    The camera is therefore started from an effect with a STABLE dependency
 *    list, and the scan callback is read through a ref so a new callback
 *    identity never remounts the camera.
 *
 * 3. `Html5Qrcode.getCameras()` itself prompts for permission in order to read
 *    device labels. Calling it before starting means asking twice and doubling
 *    the chance of a mis-timed prompt. We start with `facingMode: environment`
 *    (no enumeration needed) and only enumerate afterwards, to populate the
 *    flip-camera button.
 */
export function QrScanner({ onScan, onError, paused = false }) {
  const scannerRef = useRef(null);
  const startedRef = useRef(false);
  const lastScanRef = useRef({ text: null, at: 0 });

  // Callbacks live in refs so their identity never participates in effect deps.
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onScanRef.current = onScan;
    onErrorRef.current = onError;
  }, [onScan, onError]);

  const [status, setStatus] = useState('starting'); // starting | scanning | error
  const [errorInfo, setErrorInfo] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [activeCameraId, setActiveCameraId] = useState(null);
  // Bumping this is the ONLY way the camera restarts (retry / flip camera).
  const [startToken, setStartToken] = useState(0);
  // Which camera to request; null means "let the browser pick a rear one".
  const requestedCameraRef = useRef(null);

  const describeError = useCallback((err) => {
    const name = err?.name ?? '';
    const message = String(err?.message ?? err ?? '');

    if (name === 'NotAllowedError' || name === 'SecurityError' || /permission|denied/i.test(message)) {
      return {
        kind: 'DENIED',
        title: 'Camera permission denied',
        detail:
          'Tap the lock/ⓘ icon next to the address bar → Permissions → allow Camera, then tap Try again. On Android you may need Site settings → Camera → Allow.',
      };
    }
    if (name === 'NotReadableError' || name === 'TrackStartError' || /in use|could not start video/i.test(message)) {
      return {
        kind: 'BUSY',
        title: 'Camera is in use',
        detail: 'Another app or browser tab is holding the camera. Close it, then tap Try again.',
      };
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      return {
        kind: 'NO_CAMERA',
        title: 'No usable camera',
        detail: 'The browser could not find a camera matching the request. Try flipping the camera, or use manual entry.',
      };
    }
    // html5-qrcode rejects bad constraints by throwing a plain STRING (not an
    // Error), e.g. "'facingMode' should be string or object with exact as key".
    // That is a bug in how we called it, not a device problem — say so, so it is
    // never mistaken for a permissions or hardware fault.
    if (/facingMode|deviceId|cameraIdOrConfig|should be string/i.test(message)) {
      return {
        kind: 'CONFIG',
        title: 'Scanner configuration error',
        detail: `${message} — this is an app bug, not a device problem. Use manual entry to continue.`,
      };
    }
    return { kind: 'FAILED', title: 'Could not start the camera', detail: message || 'Unknown camera error.' };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let localScanner = null;

    async function start() {
      setStatus('starting');
      setErrorInfo(null);

      // --- Secure-context gate ---
      const isSecure = window.isSecureContext || ['localhost', '127.0.0.1'].includes(window.location.hostname);
      if (!isSecure) {
        setStatus('error');
        setErrorInfo({
          kind: 'INSECURE',
          title: 'Camera needs a secure connection',
          detail:
            'Android blocks the camera on plain http:// addresses. Open UniPay over https (the Render URL works), or add this address under chrome://flags → "Insecure origins treated as secure".',
        });
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error');
        setErrorInfo({
          kind: 'UNSUPPORTED',
          title: 'Camera not available',
          detail:
            'This browser does not expose a camera API. If you opened UniPay inside another app (Instagram, LinkedIn, a QR-scanner app), tap ⋯ → "Open in browser" and try again.',
        });
        return;
      }

      // An in-app webview or an iframe without allow="camera" reports a camera
      // API but refuses to grant it. Detecting the iframe case up front turns a
      // confusing NotAllowedError into an actionable instruction.
      if (window.self !== window.top) {
        try {
          const policy = document.featurePolicy ?? document.permissionsPolicy;
          if (policy?.allowsFeature && !policy.allowsFeature('camera')) {
            setStatus('error');
            setErrorInfo({
              kind: 'FRAMED',
              title: 'Camera blocked in this frame',
              detail: 'UniPay is embedded in a page that does not permit camera access. Open it in its own browser tab.',
            });
            return;
          }
        } catch {
          /* feature-policy API unavailable — fall through and let start() try */
        }
      }

      try {
        // The DOM node must exist before Html5Qrcode looks it up.
        if (!document.getElementById(REGION_ID)) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          if (cancelled) return;
        }

        const scanner = new Html5Qrcode(REGION_ID, { verbose: false });
        localScanner = scanner;
        scannerRef.current = scanner;

        // Prefer an explicitly chosen device; otherwise ask for a rear camera.
        //
        // html5-qrcode validates this itself and accepts ONLY a plain string or
        // an object keyed by `exact` — passing `{ ideal: ... }` throws
        // "'facingMode' should be string or object with exact as key".
        // The bare string is the soft form: the browser prefers a rear camera
        // but still returns a front one on a device that has no rear camera,
        // whereas `{ exact: 'environment' }` would fail outright there.
        const source = requestedCameraRef.current ?? { facingMode: 'environment' };

        await scanner.start(
          source,
          {
            fps: 10,
            qrbox: (vw, vh) => {
              const edge = Math.max(160, Math.floor(Math.min(vw, vh) * 0.7));
              return { width: edge, height: edge };
            },
            // No forced aspectRatio: over-constraining is a common cause of
            // OverconstrainedError on cheaper Android sensors.
          },
          (decodedText) => {
            const now = Date.now();
            if (lastScanRef.current.text === decodedText && now - lastScanRef.current.at < 2500) return;
            lastScanRef.current = { text: decodedText, at: now };
            onScanRef.current?.(decodedText);
          },
          () => {
            /* per-frame "no QR in view" — normal, far too noisy to surface */
          }
        );

        if (cancelled) {
          await scanner.stop().catch(() => {});
          await scanner.clear().catch(() => {});
          return;
        }

        startedRef.current = true;
        setStatus('scanning');

        // Now that permission is granted, labels are readable — enumerate to
        // decide whether to offer a flip-camera button. Purely cosmetic, so a
        // failure here must not affect the running scanner.
        Html5Qrcode.getCameras()
          .then((devices) => {
            if (cancelled || !devices?.length) return;
            setCameras(devices);
            setActiveCameraId((current) => current ?? requestedCameraRef.current ?? null);
          })
          .catch(() => {});
      } catch (err) {
        if (cancelled) return;

        // A specific deviceId can fail on a device that reports it oddly.
        // Fall back once to an unconstrained request before giving up.
        if (requestedCameraRef.current) {
          requestedCameraRef.current = null;
          try {
            await localScanner?.clear();
          } catch {
            /* ignore */
          }
          setStartToken((t) => t + 1);
          return;
        }

        setStatus('error');
        setErrorInfo(describeError(err));
        onErrorRef.current?.(err);
      }
    }

    start();

    return () => {
      cancelled = true;
      const scanner = localScanner ?? scannerRef.current;
      if (scanner && startedRef.current) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {});
        startedRef.current = false;
      }
      scannerRef.current = null;
    };
    // `startToken` is the only intentional restart trigger. `describeError` is a
    // stable useCallback. Deliberately NOT depending on onScan/onError — see the
    // header comment; that dependency is what broke the camera.
  }, [startToken, describeError]);

  // Pause decoding (while the amount sheet is open) without tearing the camera
  // down — restarting takes a second and looks broken on stage.
  useEffect(() => {
    const scanner = scannerRef.current;
    if (!scanner || !startedRef.current || status !== 'scanning') return;
    try {
      if (paused) scanner.pause(true);
      else scanner.resume();
    } catch {
      /* throws if mid-transition; harmless */
    }
  }, [paused, status]);

  const flipCamera = () => {
    if (cameras.length < 2) return;
    const currentIndex = cameras.findIndex((c) => c.id === activeCameraId);
    const next = cameras[(currentIndex + 1 + cameras.length) % cameras.length];
    requestedCameraRef.current = next.id;
    setActiveCameraId(next.id);
    setStartToken((t) => t + 1);
  };

  const retry = () => {
    requestedCameraRef.current = null;
    setStartToken((t) => t + 1);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/12 bg-black">
      {/* Always mounted: Html5Qrcode needs this node to exist before start(). */}
      <div id={REGION_ID} className="min-h-[300px] w-full [&_video]:!w-full [&_video]:!object-cover" />

      {status === 'scanning' && (
        <>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-[70%] w-[70%] max-w-[300px]">
              {[
                '-top-px -left-px border-l-4 border-t-4 rounded-tl-xl',
                '-top-px -right-px border-r-4 border-t-4 rounded-tr-xl',
                '-bottom-px -left-px border-l-4 border-b-4 rounded-bl-xl',
                '-bottom-px -right-px border-r-4 border-b-4 rounded-br-xl',
              ].map((pos) => (
                <span key={pos} className={`absolute h-9 w-9 border-mint-400 ${pos}`} />
              ))}
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
          <p className="max-w-[240px] text-center text-[11px] text-slate-500">
            Tap <span className="font-bold text-slate-300">Allow</span> if your browser asks for camera access.
          </p>
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
          {errorInfo?.kind !== 'INSECURE' && errorInfo?.kind !== 'UNSUPPORTED' && (
            <button type="button" onClick={retry} className="btn-ghost !min-h-0 mt-1 !px-4 !py-2 !text-[12px]">
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
