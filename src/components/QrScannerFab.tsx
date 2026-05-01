import { useState, useRef, useEffect, useCallback } from "react";
import { QrCode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import jsQR from "jsqr";

const QrScannerFab = () => {
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const detectorRef = useRef<any>(null);
  const navigate = useNavigate();

  // Pre-create BarcodeDetector once if available
  useEffect(() => {
    if ("BarcodeDetector" in window) {
      try {
        detectorRef.current = new (window as any).BarcodeDetector({
          formats: ["qr_code"],
        });
      } catch {
        detectorRef.current = null;
      }
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    cancelAnimationFrame(animFrameRef.current);
    setScanning(false);
  }, []);

  const handleDetected = useCallback(
    (url: string) => {
      stopCamera();
      try {
        const parsed = new URL(url);
        const validHosts = [
          window.location.hostname,
          "momentique.vionevents.com",
          "quick-event-moments.lovable.app",
        ];
        if (validHosts.includes(parsed.hostname)) {
          navigate(parsed.pathname + parsed.search);
        } else {
          toast.error("This QR code doesn't belong to Momentique");
        }
      } catch {
        toast.error("Invalid QR code");
      }
    },
    [navigate, stopCamera]
  );

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    // Try native BarcodeDetector first, fall back to jsQR
    if (detectorRef.current) {
      detectorRef.current
        .detect(canvas)
        .then((barcodes: any[]) => {
          if (barcodes.length > 0) {
            handleDetected(barcodes[0].rawValue);
            return;
          }
          animFrameRef.current = requestAnimationFrame(scanFrame);
        })
        .catch(() => {
          // If native detector fails, try jsQR as fallback
          tryJsQR(ctx, canvas.width, canvas.height);
        });
    } else {
      tryJsQR(ctx, canvas.width, canvas.height);
    }

    function tryJsQR(ctx: CanvasRenderingContext2D, w: number, h: number) {
      const imageData = ctx.getImageData(0, 0, w, h);
      const code = jsQR(imageData.data, w, h, { inversionAttempts: "dontInvert" });
      if (code && code.data) {
        handleDetected(code.data);
      } else {
        animFrameRef.current = requestAnimationFrame(scanFrame);
      }
    }
  }, [handleDetected]);

  // Called directly from user gesture — no async before getUserMedia
  const startScanning = () => {
    setScanning(true);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().then(() => {
            scanFrame();
          });
        }
      })
      .catch((err) => {
        if (err.name === "NotAllowedError") {
          toast.error("Camera permission denied. Please allow camera access in your browser settings.");
        } else if (err.name === "NotFoundError") {
          toast.error("No camera found on this device.");
        } else if (err.name === "NotReadableError") {
          toast.error("Camera is in use by another app.");
        } else {
          toast.error("Unable to access camera");
        }
        setScanning(false);
      });
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return (
    <>
      {/* Floating button — bigger size */}
      <button
        onClick={startScanning}
        className="fixed bottom-6 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-full gold-gradient text-primary-foreground text-sm font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
        aria-label="Scan QR Code"
      >
        <QrCode className="w-5 h-5" />
        <span>Scan QR</span>
      </button>

      {/* Scanner overlay */}
      {scanning && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center">
          <div className="absolute top-4 right-4 z-10">
            <Button
              variant="ghost"
              size="icon"
              onClick={stopCamera}
              className="text-white hover:bg-white/20"
            >
              <X className="w-6 h-6" />
            </Button>
          </div>

          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Scan guide overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-56 h-56 md:w-72 md:h-72 border-2 border-white/60 rounded-2xl" />
          </div>

          <div className="absolute bottom-8 left-0 right-0 text-center">
            <p className="text-white/80 text-sm font-body">
              Point camera at a Momentique QR code
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default QrScannerFab;
