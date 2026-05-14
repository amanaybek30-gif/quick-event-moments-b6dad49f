import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CalendarDays,
  Image as ImageIcon,
  Plus,
  LogOut,
  MoreVertical,
  Eye,
  Upload,
  Trash2,
  Lock,
  ArrowLeft,
  MessageSquare,
  X,
  Video,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  fetchAllEvents,
  createEvent,
  deleteEvent,
  uploadCoverImage,
  uploadWelcomeBackgroundImage,
  uploadShowcaseMedia,
  updateEventImages,
  updateEventWelcome,
  type EventData,
} from "@/lib/eventService";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [events, setEvents] = useState<EventData[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({ name: "", date: "", description: "", password: "", welcomeTitle: "Welcome!", welcomeMessage: "" });
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [welcomeBgFile, setWelcomeBgFile] = useState<File | null>(null);
  const [welcomeBgPreview, setWelcomeBgPreview] = useState<string | null>(null);
  const [showcasePhotoFiles, setShowcasePhotoFiles] = useState<File[]>([]);
  const [showcaseVideoFiles, setShowcaseVideoFiles] = useState<File[]>([]);
  const [showcasePhotoPreviews, setShowcasePhotoPreviews] = useState<string[]>([]);
  const [showcaseVideoPreviews, setShowcaseVideoPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Edit dialog state
  const [editingEvent, setEditingEvent] = useState<EventData | null>(null);
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
  const [editCoverPreview, setEditCoverPreview] = useState<string | null>(null);
  const [editWelcomeBgFile, setEditWelcomeBgFile] = useState<File | null>(null);
  const [editWelcomeBgPreview, setEditWelcomeBgPreview] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("Welcome!");
  const [editMessage, setEditMessage] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem("mv_role");
    if (role !== "admin") {
      navigate("/admin/login");
      return;
    }
    loadEvents();
  }, [navigate]);

  const loadEvents = async () => {
    setLoading(true);
    const data = await fetchAllEvents();
    setEvents(data);
    setLoading(false);
  };

  const totalUploads = events.reduce((sum, e) => sum + e.uploads, 0);

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCoverFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setCoverPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleShowcasePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      setShowcasePhotoFiles((prev) => [...prev, file]);
      const reader = new FileReader();
      reader.onloadend = () => setShowcasePhotoPreviews((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });
  };

  const handleShowcaseVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      setShowcaseVideoFiles((prev) => [...prev, file]);
      const reader = new FileReader();
      reader.onloadend = () => setShowcaseVideoPreviews((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });
  };

  const removeShowcasePhoto = (index: number) => {
    setShowcasePhotoFiles((prev) => prev.filter((_, i) => i !== index));
    setShowcasePhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const removeShowcaseVideo = (index: number) => {
    setShowcaseVideoFiles((prev) => prev.filter((_, i) => i !== index));
    setShowcaseVideoPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvent.password.trim()) {
      toast({ title: "Password required", description: "Set a password for organizer access.", variant: "destructive" });
      return;
    }
    if (!coverFile) {
      toast({ title: "Cover image required", description: "Please upload a cover image.", variant: "destructive" });
      return;
    }

    setCreating(true);
    const eventId = `evt-${Date.now()}`;

    const coverUrl = await uploadCoverImage(eventId, coverFile);
    if (!coverUrl) {
      toast({ title: "Upload failed", description: "Could not upload cover image.", variant: "destructive" });
      setCreating(false);
      return;
    }

    const eventData: EventData = {
      id: eventId,
      name: newEvent.name,
      date: newEvent.date,
      description: newEvent.description,
      cover_image: coverUrl,
      uploads: 0,
      contributors: 0,
      password: newEvent.password,
      welcome_title: newEvent.welcomeTitle || "Welcome!",
      welcome_message: newEvent.welcomeMessage || null,
    };

    const success = await createEvent(eventData);
    if (success) {
      const allShowcaseFiles = [...showcasePhotoFiles, ...showcaseVideoFiles];
      if (allShowcaseFiles.length > 0) {
        await Promise.all(allShowcaseFiles.map((file) => uploadShowcaseMedia(eventId, file)));
      }

      setEvents([eventData, ...events]);
      setNewEvent({ name: "", date: "", description: "", password: "", welcomeTitle: "Welcome!", welcomeMessage: "" });
      setCoverFile(null);
      setCoverPreview(null);
      setShowcasePhotoFiles([]);
      setShowcaseVideoFiles([]);
      setShowcasePhotoPreviews([]);
      setShowcaseVideoPreviews([]);
      setDialogOpen(false);
      toast({ title: "Event created!", description: `"${eventData.name}" is ready.` });
    } else {
      toast({ title: "Error", description: "Could not create event.", variant: "destructive" });
    }
    setCreating(false);
  };

  const handleDeleteEvent = async (eventId: string) => {
    const success = await deleteEvent(eventId);
    if (success) {
      setEvents(events.filter((e) => e.id !== eventId));
      toast({ title: "Event deleted" });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("mv_role");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-display font-bold text-foreground">
              Moment<span className="text-gold">ique</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="gold" size="sm">
                  <Plus className="w-4 h-4 mr-1.5" /> New Event
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-display text-xl">Create New Event</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateEvent} className="space-y-4 mt-2">
                  <Input placeholder="Event name" value={newEvent.name} onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })} className="h-12 font-body" required />
                  <Input type="date" value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })} className="h-12 font-body" required />
                  <Textarea placeholder="Description (optional)" value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} className="font-body" />
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Event password (for organizers)" value={newEvent.password} onChange={(e) => setNewEvent({ ...newEvent, password: e.target.value })} className="pl-10 h-12 font-body" required />
                  </div>

                  {/* Welcome title + message */}
                  <div>
                    <label className="block text-sm font-body text-muted-foreground mb-1">Welcome Title</label>
                    <Input placeholder="Welcome!" value={newEvent.welcomeTitle} onChange={(e) => setNewEvent({ ...newEvent, welcomeTitle: e.target.value })} className="h-11 font-body" />
                  </div>
                  <div className="relative">
                    <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Textarea placeholder="Welcome message for guests (optional)" value={newEvent.welcomeMessage} onChange={(e) => setNewEvent({ ...newEvent, welcomeMessage: e.target.value })} className="pl-10 font-body" />
                  </div>

                  {/* Cover image */}
                  <div>
                    <label className="block text-sm font-body text-muted-foreground mb-2">
                      Cover Image <span className="text-destructive">*</span>
                    </label>
                    <div className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-gold/50 transition-colors" onClick={() => document.getElementById("cover-upload")?.click()}>
                      {coverPreview ? (
                        <img src={coverPreview} alt="Cover preview" className="w-full h-32 object-cover rounded-lg" />
                      ) : (
                        <div className="py-4">
                          <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground font-body">Click to upload cover image</p>
                        </div>
                      )}
                    </div>
                    <input id="cover-upload" type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
                  </div>

                  {/* Showcase photos */}
                  <div>
                    <label className="block text-sm font-body text-muted-foreground mb-2">
                      <ImageIcon className="w-4 h-4 inline mr-1" />
                      Showcase Photos <span className="text-muted-foreground/60">(optional)</span>
                    </label>
                    <div className="border-2 border-dashed border-border rounded-lg p-3 text-center cursor-pointer hover:border-gold/50 transition-colors"
                      onClick={() => document.getElementById("showcase-photo-upload")?.click()}>
                      <Upload className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
                      <p className="text-xs text-muted-foreground font-body">Add photos</p>
                    </div>
                    <input id="showcase-photo-upload" type="file" accept="image/*" multiple className="hidden" onChange={handleShowcasePhotoUpload} />
                    {showcasePhotoPreviews.length > 0 && (
                      <div className="grid grid-cols-4 gap-2 mt-2">
                        {showcasePhotoPreviews.map((url, idx) => (
                          <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                            <img src={url} alt="Photo" className="w-full h-full object-cover" />
                            <button type="button" className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive/80 flex items-center justify-center" onClick={(e) => { e.stopPropagation(); removeShowcasePhoto(idx); }}>
                              <X className="w-3 h-3 text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Showcase videos */}
                  <div>
                    <label className="block text-sm font-body text-muted-foreground mb-2">
                      <Video className="w-4 h-4 inline mr-1" />
                      Showcase Videos <span className="text-muted-foreground/60">(optional)</span>
                    </label>
                    <div className="border-2 border-dashed border-border rounded-lg p-3 text-center cursor-pointer hover:border-gold/50 transition-colors"
                      onClick={() => document.getElementById("showcase-video-upload")?.click()}>
                      <Upload className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
                      <p className="text-xs text-muted-foreground font-body">Add videos</p>
                    </div>
                    <input id="showcase-video-upload" type="file" accept="video/*" multiple className="hidden" onChange={handleShowcaseVideoUpload} />
                    {showcaseVideoPreviews.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {showcaseVideoPreviews.map((url, idx) => (
                          <div key={idx} className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                            <video src={url} className="w-full h-full object-cover" muted />
                            <button type="button" className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive/80 flex items-center justify-center" onClick={(e) => { e.stopPropagation(); removeShowcaseVideo(idx); }}>
                              <X className="w-3 h-3 text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Button type="submit" variant="gold" size="lg" className="w-full py-5" disabled={creating}>
                    {creating ? "Creating..." : "Create Event"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-2 gap-4 mb-8">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-lg gold-gradient flex items-center justify-center">
                <CalendarDays className="w-4 h-4 text-primary-foreground" />
              </div>
            </div>
            <p className="text-2xl font-display font-bold text-foreground">{events.length}</p>
            <p className="text-sm text-muted-foreground font-body">Total Events</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-lg gold-gradient flex items-center justify-center">
                <Upload className="w-4 h-4 text-primary-foreground" />
              </div>
            </div>
            <p className="text-2xl font-display font-bold text-foreground">{totalUploads}</p>
            <p className="text-sm text-muted-foreground font-body">Total Uploads</p>
          </motion.div>
        </div>

        <h2 className="text-lg font-display font-semibold text-foreground mb-4">Your Events</h2>
        {loading ? (
          <p className="text-muted-foreground font-body text-center py-8">Loading events...</p>
        ) : (
          <div className="space-y-4">
            {events.map((event, index) => (
              <motion.div key={event.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }} className="bg-card rounded-xl border border-border overflow-hidden hover:border-gold/30 transition-colors">
                <div className="flex">
                  <div className="w-24 h-24 md:w-32 md:h-32 shrink-0">
                    {event.cover_image ? (
                      <img src={event.cover_image} alt={event.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-display font-semibold text-foreground truncate">{event.name}</h3>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="shrink-0 -mr-2 -mt-1 h-8 w-8">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/organizer/${event.id}`)}>
                              <Eye className="w-4 h-4 mr-2" /> Manage Event
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/event/${event.id}`)}>
                              <ImageIcon className="w-4 h-4 mr-2" /> Guest View
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteEvent(event.id)}>
                              <Trash2 className="w-4 h-4 mr-2" /> Delete Event
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <p className="text-sm text-muted-foreground font-body">
                        {new Date(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                      <p className="text-xs text-gold font-body mt-1 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Password: {event.password}
                      </p>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground font-body mt-2">
                      <span className="flex items-center gap-1"><Upload className="w-3 h-3" /> {event.uploads} uploads</span>
                      <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" /> {event.contributors} contributors</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
