import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Upload, Video, ArrowLeft, User, Eye, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchEventById,
  fetchEventMedia,
  uploadMedia,
  type EventData,
  type MediaItem,
} from "@/lib/eventService";
import { compressImage, compressVideo } from "@/lib/mediaCompression";
import { supabase } from "@/integrations/supabase/client";
import MediaGallery from "@/components/MediaGallery";

type ViewState = "landing" | "camera" | "gallery";

const MAX_RECORDING_MS = 30 * 60 * 1000;

const RECORDING_MIME_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const;

const getPreferredRecordingMimeType = () => {
  if (typeof MediaRecorder === "undefined") return "";

  return RECORDING_MIME_TYPES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
};

const getCameraConstraints = (
  mode: "photo" | "video",
  facing: "environment" | "user",
  fallback = false
): MediaStreamConstraints => ({
  video: fallback
    ? { facingMode: facing }
    : {
        facingMode: facing,
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 30 },
      },
  audio:
    mode === "video"
      ? fallback
        ? true
        : {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: { ideal: 2 },
            sampleRate: { ideal: 48000 },
          }
      : false,
});

const EventPage = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [view, setView] = useState<ViewState>("landing");
  const [guestName, setGuestName] = useState("");
  const [capturedCount, setCapturedCount] = useState(0);
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cameraMode, setCameraMode] = useState<"photo" | "video">("photo");
  const [showWelcome, setShowWelcome] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [savingCount, setSavingCount] = useState(0);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const zoomRange = useRef<{ min: number; max: number; step: number }>({ min: 1, max: 1, step: 0.1 });
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartZoom = useRef<number>(1);

  // Load event and media
  useEffect(() => {
    if (!eventId) return;
    const load = async () => {
      setLoading(true);
      const found = await fetchEventById(eventId);
      if (found) {
        setEvent(found);
        if (found.welcome_message) {
          const welcomeKey = `momentique_welcome_${eventId}`;
          if (!sessionStorage.getItem(welcomeKey)) {
            setShowWelcome(true);
            sessionStorage.setItem(welcomeKey, "true");
          }
        }
        const media = await fetchEventMedia(eventId);
        setMediaItems(media);
        setCapturedCount(media.length);
      }
      setLoading(false);
    };
    load();
  }, [eventId]);

  useEffect(() => {
    return () => {
      if (recordingTimeoutRef.current) {
        window.clearTimeout(recordingTimeoutRef.current);
      }

      if (mediaRecorderRef.current?.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // Realtime subscription for gallery sync across devices
  useEffect(() => {
    if (!eventId) return;
    const channel = supabase
      .channel(`event-media-${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "event_media",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const newItem = payload.new as MediaItem;
          setMediaItems((prev) => {
            if (prev.some((m) => m.id === newItem.id)) return prev;
            return [newItem, ...prev];
          });
          setCapturedCount((c) => c + 1);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "event_media",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const oldItem = payload.old as { id: string };
          setMediaItems((prev) => prev.filter((m) => m.id !== oldItem.id));
          setCapturedCount((c) => Math.max(0, c - 1));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  const persistMedia = useCallback(async (blob: Blob, type: "image" | "video") => {
    if (!eventId) return;
    setSavingCount((c) => c + 1);
    try {
      const compressed = type === "image"
        ? await compressImage(blob)
        : await compressVideo(blob);
      const item = await uploadMedia(eventId, compressed, type, guestName || "Guest");
      if (item) {
        // Realtime will handle adding to state, but add optimistically too
        setMediaItems((prev) => {
          if (prev.some((m) => m.id === item.id)) return prev;
          return [item, ...prev];
        });
        setCapturedCount((c) => c + 1);
        showFlash(type === "image" ? "📸 Photo saved!" : "🎬 Video saved!");
      }
    } catch (err) {
      console.error("Upload failed:", err);
      showFlash("Upload failed, try again");
    }
    setSavingCount((c) => c - 1);
  }, [eventId, guestName]);

  const showFlash = (msg: string) => {
    setFlashMessage(msg);
    setTimeout(() => setFlashMessage(null), 2000);
  };

  const processFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const tasks = Array.from(files).map((file) => {
      const type = file.type.startsWith("video") ? "video" as const : "image" as const;
      return persistMedia(file, type);
    });
    await Promise.all(tasks);
  }, [persistMedia]);

  const stopRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current;

    if (recordingTimeoutRef.current) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    if (!recorder || recorder.state === "inactive") {
      setIsRecording(false);
      return;
    }

    setIsRecording(false);

    await new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
      recorder.stop();
    });
  }, []);

  const applyZoom = useCallback((level: number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const clamped = Math.min(Math.max(level, zoomRange.current.min), zoomRange.current.max);
    setZoomLevel(clamped);
    try {
      (track as any).applyConstraints({ advanced: [{ zoom: clamped }] });
    } catch {}
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist.current = Math.hypot(dx, dy);
      pinchStartZoom.current = zoomLevel;
    }
  }, [zoomLevel]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDist.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = dist / pinchStartDist.current;
      applyZoom(pinchStartZoom.current * scale);
    }
  }, [applyZoom]);

  const handleTouchEnd = useCallback(() => {
    pinchStartDist.current = null;
  }, []);

  const startCamera = async (mode: "photo" | "video", facing: "environment" | "user") => {
    if (mediaRecorderRef.current?.state === "recording") {
      await stopRecording();
    }

    stopCamera();

    try {
      let stream: MediaStream;

      try {
        stream = await navigator.mediaDevices.getUserMedia(getCameraConstraints(mode, facing));
      } catch {
        stream = await navigator.mediaDevices.getUserMedia(getCameraConstraints(mode, facing, true));
      }

      stream.getVideoTracks().forEach((track) => {
        track.enabled = true;
        track.contentHint = "motion";
      });

      stream.getAudioTracks().forEach((track) => {
        track.enabled = true;
        track.contentHint = "speech";
      });

      streamRef.current = stream;

      // Detect native zoom capabilities
      const vTrack = stream.getVideoTracks()[0];
      const caps = vTrack?.getCapabilities?.() as any;
      if (caps?.zoom) {
        zoomRange.current = { min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1 };
        setZoomLevel(caps.zoom.min);
      } else {
        zoomRange.current = { min: 1, max: 1, step: 0.1 };
        setZoomLevel(1);
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch {
      // Fallback to file input
      stopCamera();
      const input = document.createElement("input");
      input.type = "file";
      input.accept = mode === "photo" ? "image/*" : "video/*";
      input.capture = facing === "user" ? "user" : "environment";
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const t = file.type.startsWith("video") ? "video" as const : "image" as const;
          persistMedia(file, t);
        }
      };
      input.click();
      setView("landing");
      exitFullscreen();
    }
  };

  const requestFullscreen = () => {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => undefined);
    } else if ((el as any).webkitRequestFullscreen) {
      (el as any).webkitRequestFullscreen();
    }
  };

  const exitFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else if ((document as any).webkitFullscreenElement) {
      (document as any).webkitExitFullscreen?.();
    }
  };

  const openCamera = async (mode: "photo" | "video") => {
    setCameraMode(mode);
    setView("camera");
    requestFullscreen();
    await startCamera(mode, facingMode);
  };

  const stopCamera = () => {
    if (recordingTimeoutRef.current) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror selfie
    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) persistMedia(blob, "image");
    }, "image/jpeg", 0.92);
  };

  const startRecording = async () => {
    let activeStream = streamRef.current;

    if (!activeStream) return;

    if (activeStream.getAudioTracks().length === 0) {
      await startCamera("video", facingMode);
      activeStream = streamRef.current;
    }

    if (!activeStream || activeStream.getAudioTracks().length === 0) {
      showFlash("Please allow microphone access for video audio");
      return;
    }

    const mimeType = getPreferredRecordingMimeType();

    chunksRef.current = [];

    const recorder = new MediaRecorder(activeStream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 6_000_000,
      audioBitsPerSecond: 128_000,
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onerror = (event) => {
      console.error("Recording error:", event);
      showFlash("Video recording failed, please try again");
      setIsRecording(false);
    };

    recorder.onstop = () => {
      const finalMimeType = mimeType || recorder.mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type: finalMimeType });

      chunksRef.current = [];
      mediaRecorderRef.current = null;

      if (blob.size > 0) {
        void persistMedia(blob, "video");
      } else {
        showFlash("Video could not be saved, please try again");
      }
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);

    recordingTimeoutRef.current = window.setTimeout(() => {
      showFlash("30 minute limit reached — saving video");
      void stopRecording();
    }, MAX_RECORDING_MS);
  };

  const flipCamera = async () => {
    if (isRecording) {
      await stopRecording();
    }

    const newFacing = facingMode === "environment" ? "user" : "environment";
    setFacingMode(newFacing);
    await startCamera(cameraMode, newFacing);
  };

  const switchMode = async (mode: "photo" | "video") => {
    if (mode === cameraMode) return;

    if (isRecording) {
      await stopRecording();
    }

    setCameraMode(mode);
    await startCamera(mode, facingMode);
  };

  const handleFileUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*";
    input.multiple = true;
    input.onchange = (e) => processFiles((e.target as HTMLInputElement).files);
    input.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-body">Loading event...</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground font-body">Event not found</p>
        <Button variant="ghost" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
        </Button>
      </div>
    );
  }

  const welcomePopup = showWelcome && event.welcome_message && (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 bg-foreground/80 flex items-center justify-center p-4" onClick={() => setShowWelcome(false)}>
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="bg-card rounded-2xl border border-border p-8 max-w-sm w-full text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="w-16 h-16 rounded-full gold-gradient flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">🎉</span>
        </div>
        <h2 className="text-xl font-display font-bold text-foreground mb-3">Welcome!</h2>
        <p className="text-muted-foreground font-body mb-6">{event.welcome_message}</p>
        <Button variant="gold" size="lg" className="w-full py-5" onClick={() => setShowWelcome(false)}>Let's Go!</Button>
      </motion.div>
    </motion.div>
  );

  const galleryMedia = mediaItems.map((m) => ({
    id: m.id,
    url: m.file_url,
    type: m.type as "image" | "video",
    uploadedAt: m.uploaded_at,
    uploaderName: m.uploader_name,
  }));

  if (view === "camera") {
    return (
      <div className="fixed inset-0 bg-black flex flex-col z-50" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        <video
          ref={videoRef}
          className={`flex-1 w-full object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
          autoPlay
          playsInline
          muted
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Flash message */}
        <AnimatePresence>
          {flashMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-sm font-body z-20"
            >
              {flashMessage}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Saving indicator */}
        {savingCount > 0 && (
          <div className="absolute top-4 right-4 bg-black/60 text-white px-3 py-1.5 rounded-full text-xs font-body z-20 animate-pulse">
            Saving {savingCount}...
          </div>
        )}

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 pb-8 pt-16 bg-gradient-to-t from-black/90 to-transparent">
          {/* Mode switcher (Photo / Video) */}
          <div className="flex items-center justify-center gap-6 mb-5">
            <button
              onClick={() => switchMode("photo")}
              className={`text-sm font-body font-semibold uppercase tracking-wider transition-colors ${cameraMode === "photo" ? "text-yellow-400" : "text-white/60"}`}
            >
              Photo
            </button>
            <button
              onClick={() => switchMode("video")}
              className={`text-sm font-body font-semibold uppercase tracking-wider transition-colors ${cameraMode === "video" ? "text-yellow-400" : "text-white/60"}`}
            >
              Video
            </button>
          </div>

          {/* Main controls row */}
          <div className="flex items-center justify-between px-8">
            {/* Back */}
            <button
              className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white"
              onClick={async () => {
                if (isRecording) {
                  await stopRecording();
                }

                stopCamera();
                exitFullscreen();
                setView("landing");
              }}
            >
              <ArrowLeft className="w-6 h-6" />
            </button>

            {/* Shutter */}
            {cameraMode === "photo" ? (
              <button
                onClick={takePhoto}
                className="w-20 h-20 rounded-full border-4 border-white bg-white/20 active:bg-white/50 transition-all active:scale-95"
              />
            ) : (
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`w-20 h-20 rounded-full border-4 border-white transition-all flex items-center justify-center ${isRecording ? "bg-red-500" : "bg-red-500/60"}`}
              >
                {isRecording && <div className="w-7 h-7 rounded-sm bg-white" />}
              </button>
            )}

            {/* Flip camera */}
            <button
              className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white"
              onClick={flipCamera}
            >
              <SwitchCamera className="w-6 h-6" />
            </button>
          </div>

          {isRecording && (
            <p className="text-center text-red-400 text-sm font-body mt-3 animate-pulse">● Recording... max 30 min</p>
          )}
        </div>
      </div>
    );
  }

  if (view === "gallery") {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3">
        <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setView("landing")}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="font-display font-semibold text-foreground text-lg">{event.name}</h1>
                <p className="text-sm text-muted-foreground font-body">Event Gallery</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => openCamera("photo")}>
                <Camera className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleFileUpload}>
                <Upload className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
        <div className="container mx-auto px-4 py-6">
          <MediaGallery extraMedia={galleryMedia} showDownload />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {welcomePopup}
      <AnimatePresence mode="wait">
        <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="relative h-44 md:h-72">
            <Button variant="ghost" size="icon" className="absolute top-3 left-3 z-10 text-white bg-black/30 hover:bg-black/50 w-8 h-8 md:w-10 md:h-10" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
            </Button>
            {event.cover_image ? (
              <img src={event.cover_image} alt={event.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-muted" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <span className="inline-block px-2.5 py-0.5 md:px-3 md:py-1 rounded-full text-[10px] md:text-xs font-medium gold-gradient text-primary-foreground mb-2 md:mb-3">Live Event</span>
                <h1 className="text-xl md:text-3xl font-display font-bold text-primary-foreground">{event.name}</h1>
                <p className="text-primary-foreground/70 font-body text-xs md:text-sm mt-1">
                  {new Date(event.date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                </p>
              </motion.div>
            </div>
          </div>

          <div className="container mx-auto px-4 py-5 md:py-8 max-w-lg">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="text-center mb-5 md:mb-8">
              <h2 className="text-lg md:text-2xl font-display font-bold text-foreground mb-1 md:mb-2">Capture the Moment ✨</h2>
              <p className="text-sm md:text-base text-muted-foreground font-body">Take photos and videos to add to the event gallery</p>
              {capturedCount > 0 && <p className="text-xs md:text-sm text-gold font-body mt-1.5">✓ {capturedCount} moment{capturedCount !== 1 ? "s" : ""} captured</p>}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="mb-4 md:mb-6">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Your name (optional)" value={guestName} onChange={(e) => setGuestName(e.target.value)} className="pl-10 h-10 md:h-12 font-body text-sm" />
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="space-y-2.5 md:space-y-3">
              <Button variant="gold" size="lg" className="w-full text-sm md:text-lg py-5 md:py-6 flex items-center justify-center gap-2" onClick={() => openCamera("photo")}>
                <Camera className="w-5 h-5 md:w-6 md:h-6" /> Open Camera
              </Button>
              <Button variant="gold-outline" size="lg" className="w-full text-sm md:text-lg py-5 md:py-6" onClick={handleFileUpload}>
                <Upload className="w-4 h-4 md:w-5 md:h-5 mr-2" /> Upload from Device
              </Button>
              <Button variant="outline" size="lg" className="w-full text-sm md:text-lg py-5 md:py-6" onClick={() => setView("gallery")}>
                <Eye className="w-4 h-4 md:w-5 md:h-5 mr-2" /> View Gallery {capturedCount > 0 && `(${capturedCount})`}
              </Button>
            </motion.div>

            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="text-center text-[10px] md:text-xs text-muted-foreground mt-5 md:mt-6 font-body">
              Powered by <span className="font-semibold">VION Events</span>
            </motion.p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default EventPage;
