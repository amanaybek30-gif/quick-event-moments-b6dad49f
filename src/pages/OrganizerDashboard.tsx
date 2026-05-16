import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Download, QrCode, Upload, Users,
  Image as ImageIcon, Share2, Lock, Trash2, MessageSquare, ImagePlus, Pencil,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import MediaGallery from "@/components/MediaGallery";
import {
  fetchEventById, fetchEventMedia, deleteMedia,
  clearEventMedia, updateEventWelcome, updateEventQrEnabled,
  updateEventImages, uploadCoverImage, uploadWelcomeBackgroundImage,
  type EventData, type MediaItem,
} from "@/lib/eventService";

const OrganizerDashboard = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [qrOpen, setQrOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [event, setEvent] = useState<EventData | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [welcomeTitle, setWelcomeTitle] = useState("Welcome!");
  const [welcomeMsg, setWelcomeMsg] = useState("");
  const [welcomeDialogOpen, setWelcomeDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [qrEnabled, setQrEnabled] = useState(true);
  const [imagesDialogOpen, setImagesDialogOpen] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [welcomeBgFile, setWelcomeBgFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [welcomeBgPreview, setWelcomeBgPreview] = useState<string | null>(null);
  const [savingImages, setSavingImages] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    const load = async () => {
      setLoading(true);
      const found = await fetchEventById(eventId);
      if (found) {
        setEvent(found);
        setWelcomeTitle(found.welcome_title || "Welcome!");
        setWelcomeMsg(found.welcome_message || "");
        setQrEnabled(found.qr_enabled ?? true);
        const role = localStorage.getItem("mv_role");
        const sessionKey = `organizer_auth_${eventId}`;
        if (role === "admin" || sessionStorage.getItem(sessionKey) === "true") {
          setAuthenticated(true);
        }
      }
      setLoading(false);
    };
    load();
  }, [eventId]);

  useEffect(() => {
    if (authenticated && eventId) {
      fetchEventMedia(eventId).then(setMediaItems);
    }
  }, [authenticated, eventId]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (event && passwordInput === event.password) {
      setAuthenticated(true);
      sessionStorage.setItem(`organizer_auth_${eventId}`, "true");
      toast({ title: "Access granted!", description: "Welcome to the event dashboard." });
    } else {
      toast({ title: "Wrong password", description: "Please try again.", variant: "destructive" });
    }
  };

  const handleDeleteMedia = async (mediaId: string) => {
    const success = await deleteMedia(mediaId);
    if (success) {
      setMediaItems((prev) => prev.filter((m) => m.id !== mediaId));
      toast({ title: "Media deleted" });
    }
  };

  const handleClearGallery = async () => {
    if (!eventId) return;
    const success = await clearEventMedia(eventId);
    if (success) {
      setMediaItems([]);
      toast({ title: "Gallery cleared", description: "All media has been removed." });
    }
  };

  const handleSaveWelcome = async () => {
    if (!eventId) return;
    const success = await updateEventWelcome(eventId, welcomeTitle, welcomeMsg);
    if (success) {
      setEvent((prev) => prev ? { ...prev, welcome_title: welcomeTitle, welcome_message: welcomeMsg } : prev);
      setWelcomeDialogOpen(false);
      toast({ title: "Welcome message saved!" });
    }
  };

  const handleToggleQr = async (enabled: boolean) => {
    if (!eventId) return;
    setQrEnabled(enabled);
    const success = await updateEventQrEnabled(eventId, enabled);
    if (success) {
      setEvent((prev) => prev ? { ...prev, qr_enabled: enabled } : prev);
      toast({ title: enabled ? "QR access enabled" : "QR access disabled" });
    } else {
      setQrEnabled(!enabled);
      toast({ title: "Failed to update", variant: "destructive" });
    }
  };

  const openImagesDialog = () => {
    setCoverFile(null);
    setWelcomeBgFile(null);
    setCoverPreview(event?.cover_image || null);
    setWelcomeBgPreview(event?.welcome_background_image || null);
    setImagesDialogOpen(true);
  };

  const handleSaveImages = async () => {
    if (!eventId) return;
    setSavingImages(true);
    try {
      const updates: { cover_image?: string; welcome_background_image?: string | null } = {};
      if (coverFile) {
        const url = await uploadCoverImage(eventId, coverFile);
        if (url) updates.cover_image = `${url}?t=${Date.now()}`;
      }
      if (welcomeBgFile) {
        const url = await uploadWelcomeBackgroundImage(eventId, welcomeBgFile);
        if (url) updates.welcome_background_image = url;
      }
      if (Object.keys(updates).length === 0) {
        setImagesDialogOpen(false);
        return;
      }
      const ok = await updateEventImages(eventId, updates);
      if (ok) {
        setEvent((prev) => (prev ? { ...prev, ...updates } as EventData : prev));
        toast({ title: "Images updated!" });
        setImagesDialogOpen(false);
      } else {
        toast({ title: "Failed to update images", variant: "destructive" });
      }
    } finally {
      setSavingImages(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-body">Loading...</p>
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

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <Button variant="ghost" size="sm" className="mb-8" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div className="text-center mb-8">
            <h1 className="text-2xl font-display font-bold text-foreground mb-2">{event.name}</h1>
            <p className="text-muted-foreground font-body">Enter the event password to continue</p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input type="password" placeholder="Event password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} className="pl-10 h-12 font-body" required autoFocus />
            </div>
            <Button type="submit" variant="gold" size="lg" className="w-full py-6">Access Event</Button>
          </form>
          <p className="text-center text-xs text-muted-foreground mt-6 font-body">Powered by <span className="font-semibold">VION Events</span></p>
        </motion.div>
      </div>
    );
  }

  const PRODUCTION_HOST = "momentique.vionevents.com";
  const isProduction = window.location.hostname === PRODUCTION_HOST || window.location.hostname === "quick-event-moments.lovable.app";
  const baseUrl = isProduction ? `https://${PRODUCTION_HOST}` : window.location.origin;
  const eventUrl = `${baseUrl}/event/${eventId}`;

  const downloadQR = () => {
    const svgEl = document.getElementById("qr-code-svg");
    if (!svgEl) return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgEl);
    const img = new window.Image();
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      canvas.width = 1024;
      canvas.height = 1024;
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 1024, 1024);
        ctx.drawImage(img, 64, 64, 896, 896);
      }
      const link = document.createElement("a");
      link.download = `${event.name.replace(/\s+/g, "-")}-QR.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: "QR code downloaded!" });
    };
    img.src = url;
  };

  const copyLink = () => {
    navigator.clipboard.writeText(eventUrl);
    toast({ title: "Link copied!", description: "Share this link with your guests." });
  };

  const galleryMedia = mediaItems.map((m) => ({
    id: m.id,
    url: m.file_url,
    type: m.type as "image" | "video",
    uploadedAt: m.uploaded_at,
    uploaderName: m.uploader_name,
  }));

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-semibold text-foreground truncate">{event.name}</h1>
            <p className="text-sm text-muted-foreground font-body">
              {new Date(event.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {event.cover_image && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative rounded-xl overflow-hidden mb-6 h-40 md:h-56">
            <img src={event.cover_image} alt={event.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
          </motion.div>
        )}

        <div className="grid grid-cols-3 gap-3 mb-6">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border p-4 text-center">
            <Upload className="w-5 h-5 text-gold mx-auto mb-1" />
            <p className="text-xl font-display font-bold text-foreground">{mediaItems.length}</p>
            <p className="text-xs text-muted-foreground font-body">Uploads</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card rounded-xl border border-border p-4 text-center">
            <Users className="w-5 h-5 text-gold mx-auto mb-1" />
            <p className="text-xl font-display font-bold text-foreground">{new Set(mediaItems.map((m) => m.uploader_name)).size}</p>
            <p className="text-xs text-muted-foreground font-body">Contributors</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl border border-border p-4 text-center">
            <ImageIcon className="w-5 h-5 text-gold mx-auto mb-1" />
            <p className="text-xl font-display font-bold text-foreground">{mediaItems.filter((m) => m.type === "image").length}</p>
            <p className="text-xs text-muted-foreground font-body">Photos</p>
          </motion.div>
        </div>

        {/* QR Toggle */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="bg-card rounded-xl border border-border p-4 mb-4 flex items-center justify-between">
          <div>
            <p className="font-body font-medium text-foreground text-sm">QR Code Access</p>
            <p className="text-xs text-muted-foreground font-body">
              {qrEnabled ? "Guests can access the gallery via QR code" : "QR code access is disabled"}
            </p>
          </div>
          <Switch checked={qrEnabled} onCheckedChange={handleToggleQr} />
        </motion.div>

        <div className="flex gap-3 mb-4">
          <Dialog open={qrOpen} onOpenChange={setQrOpen}>
            <DialogTrigger asChild>
              <Button variant="gold" className="flex-1"><QrCode className="w-4 h-4 mr-2" /> QR Code</Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm text-center">
              <DialogHeader>
                <DialogTitle className="font-display text-xl">Event QR Code</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4 py-4">
                {!qrEnabled && (
                  <div className="bg-destructive/10 text-destructive text-sm font-body rounded-lg px-4 py-2 w-full">
                    QR access is currently disabled. Guests scanning this code will see a blocked message.
                  </div>
                )}
                <div className="p-4 bg-white rounded-xl border border-border">
                  <QRCodeSVG id="qr-code-svg" value={eventUrl} size={220} level="H" fgColor="#000000" bgColor="#ffffff" />
                </div>
                <p className="text-sm text-muted-foreground font-body break-all px-4">{eventUrl}</p>
                <div className="flex gap-3 w-full">
                  <Button variant="gold" className="flex-1" onClick={downloadQR}><Download className="w-4 h-4 mr-2" /> Download PNG</Button>
                  <Button variant="gold-outline" className="flex-1" onClick={copyLink}><Share2 className="w-4 h-4 mr-2" /> Copy Link</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="gold-outline" className="flex-1" onClick={copyLink}><Share2 className="w-4 h-4 mr-2" /> Share Link</Button>
        </div>

        <div className="flex gap-3 mb-8">
          <Dialog open={welcomeDialogOpen} onOpenChange={setWelcomeDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex-1"><MessageSquare className="w-4 h-4 mr-2" /> Welcome Message</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display text-xl">Set Welcome Message</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <label className="block text-sm font-body text-muted-foreground mb-1">Title</label>
                  <Input placeholder="Welcome!" value={welcomeTitle} onChange={(e) => setWelcomeTitle(e.target.value)} className="font-body h-11" />
                </div>
                <div>
                  <label className="block text-sm font-body text-muted-foreground mb-1">Message</label>
                  <Textarea placeholder="Enter a welcome message guests will see..." value={welcomeMsg} onChange={(e) => setWelcomeMsg(e.target.value)} className="font-body min-h-[100px]" />
                </div>
                <Button variant="gold" className="w-full" onClick={handleSaveWelcome}>Save Message</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={imagesDialogOpen} onOpenChange={(o) => (o ? openImagesDialog() : setImagesDialogOpen(false))}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex-1"><ImagePlus className="w-4 h-4 mr-2" /> Cover & Background</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display text-xl">Edit Cover & Welcome Background</DialogTitle>
              </DialogHeader>
              <div className="space-y-5 mt-2">
                <div>
                  <label className="block text-sm font-body text-muted-foreground mb-2">Cover Image</label>
                  {coverPreview && (
                    <img src={coverPreview} alt="Cover preview" className="w-full h-32 object-cover rounded-lg mb-2" />
                  )}
                  <Input type="file" accept="image/*" onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setCoverFile(f);
                    if (f) setCoverPreview(URL.createObjectURL(f));
                  }} className="font-body" />
                </div>
                <div>
                  <label className="block text-sm font-body text-muted-foreground mb-2">Welcome Background Image (optional)</label>
                  {welcomeBgPreview ? (
                    <img src={welcomeBgPreview} alt="Welcome background preview" className="w-full h-32 object-cover rounded-lg mb-2" />
                  ) : (
                    <p className="text-xs text-muted-foreground font-body mb-2">If empty, the cover image is used as the welcome background.</p>
                  )}
                  <Input type="file" accept="image/*" onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setWelcomeBgFile(f);
                    if (f) setWelcomeBgPreview(URL.createObjectURL(f));
                  }} className="font-body" />
                </div>
                <Button variant="gold" className="w-full" onClick={handleSaveImages} disabled={savingImages}>
                  {savingImages ? "Saving..." : "Save Images"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          {mediaItems.length > 0 && (
            <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={handleClearGallery}>
              <Trash2 className="w-4 h-4 mr-2" /> Clear Gallery
            </Button>
          )}
        </div>

        <h2 className="text-lg font-display font-semibold text-foreground mb-4">Event Gallery</h2>
        <MediaGallery showDownload extraMedia={galleryMedia} canDelete onDeleteMedia={handleDeleteMedia} />
      </div>
    </div>
  );
};

export default OrganizerDashboard;
