import { Camera, Keyboard, ScanBarcode, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface BarcodeScannerModalProps {
  open: boolean;
  title?: string;
  onDetected: (code: string) => void;
  onClose: () => void;
}

interface BarcodeDetectorResult {
  rawValue: string;
}

interface BarcodeDetectorInstance {
  detect: (source: HTMLVideoElement) => Promise<BarcodeDetectorResult[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: {
      formats?: string[];
    }) => BarcodeDetectorInstance;
  }
}

export function BarcodeScannerModal({
  open,
  title = 'Ler Código de Barras',
  onDetected,
  onClose,
}: BarcodeScannerModalProps) {
  const [mode, setMode] = useState<'usb' | 'camera'>('usb');
  const [manualInput, setManualInput] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const usbInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setManualInput('');
      setCameraError(null);
      setMode('usb');
      return;
    }
    const timer = setTimeout(() => {
      usbInputRef.current?.focus();
    }, 80);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    const stopCamera = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setCameraActive(false);
    };

    if (!open || mode !== 'camera') {
      stopCamera();
      return;
    }

    let cancelled = false;
    setCameraError(null);

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          'Câmera não disponível neste navegador. Utilize o modo Leitor USB / Digitação.'
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraActive(true);

        if (!window.BarcodeDetector) {
          setCameraError(
            'API nativa BarcodeDetector não suportada neste navegador. Aproxime ou utilize o Leitor USB (HID).'
          );
          return;
        }

        const detector = new window.BarcodeDetector({
          formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'itf', 'codabar', 'qr_code'],
        });

        const scanFrame = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            if (videoRef.current.readyState >= 2) {
              const results = await detector.detect(videoRef.current);
              if (results.length > 0 && results[0].rawValue) {
                const code = results[0].rawValue.trim().toUpperCase();
                stopCamera();
                onDetected(code);
                onClose();
                return;
              }
            }
          } catch {
            // Continue scanning
          }
          rafRef.current = requestAnimationFrame(scanFrame);
        };

        rafRef.current = requestAnimationFrame(scanFrame);
      } catch (err) {
        setCameraError(
          err instanceof Error
            ? `Não foi possível acessar a câmera (${err.message}). Utilize o Leitor USB / Pistola.`
            : 'Permissão de câmera negada.'
        );
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, mode, onDetected, onClose]);

  if (!open) return null;

  const handleUsbSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = manualInput.trim().toUpperCase();
    if (!cleaned) return;
    onDetected(cleaned);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanBarcode className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar leitor"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setMode('usb')}
              className={`flex-1 py-2 px-3 text-xs font-medium rounded-md inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'usb'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span>Leitor USB / Pistola (HID)</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('camera')}
              className={`flex-1 py-2 px-3 text-xs font-medium rounded-md inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'camera'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Câmera ao Vivo</span>
            </button>
          </div>

          {mode === 'usb' ? (
            <form onSubmit={handleUsbSubmit} className="space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Aponte o leitor de código de barras USB ou Bluetooth para a etiqueta do equipamento. O leitor preencherá o campo abaixo e confirmará automaticamente.
              </p>
              <input
                ref={usbInputRef}
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Aguardando bip do leitor ou digite o código..."
                className="w-full px-3.5 py-2.5 text-sm font-mono uppercase bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:bg-white focus:border-slate-900"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!manualInput.trim()}
                  className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 rounded-lg cursor-pointer"
                >
                  Confirmar Código
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              {cameraError && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  {cameraError}
                </div>
              )}
              <div className="relative aspect-video bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
                {!cameraActive && !cameraError && (
                  <span className="text-xs text-slate-300">
                    Iniciando câmera...
                  </span>
                )}
                {cameraActive && (
                  <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-0.5 bg-red-500/80 pointer-events-none" />
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Posicione o código de barras (Code 128, Code 39, EAN-13 ou QR) no centro da linha guia.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
