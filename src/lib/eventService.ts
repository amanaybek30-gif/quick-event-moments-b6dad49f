import { supabase } from "@/integrations/supabase/client";

export interface EventData {
  id: string;
  name: string;
  date: string;
  description: string;
  cover_image: string;
  password: string;
  welcome_message?: string | null;
  uploads: number;
  contributors: number;
  created_at?: string;
}

// Map DB row to EventData
const mapRow = (row: any): EventData => ({
  id: row.id,
  name: row.name,
  date: row.date,
  description: row.description || "",
  cover_image: row.cover_image || "",
  password: row.password,
  welcome_message: row.welcome_message,
  uploads: row.uploads || 0,
  contributors: row.contributors || 0,
  created_at: row.created_at,
});

export const fetchAllEvents = async (): Promise<EventData[]> => {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching events:", error);
    return [];
  }
  return (data || []).map(mapRow);
};

export const fetchEventById = async (eventId: string): Promise<EventData | null> => {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
};

export const createEvent = async (event: EventData): Promise<boolean> => {
  const { error } = await supabase.from("events").insert({
    id: event.id,
    name: event.name,
    date: event.date,
    description: event.description,
    cover_image: event.cover_image,
    password: event.password,
    welcome_message: event.welcome_message || null,
    uploads: 0,
    contributors: 0,
  });
  if (error) {
    console.error("Error creating event:", error);
    return false;
  }
  return true;
};

export const deleteEvent = async (eventId: string): Promise<boolean> => {
  const { error } = await supabase.from("events").delete().eq("id", eventId);
  return !error;
};

export const updateEventWelcome = async (eventId: string, message: string): Promise<boolean> => {
  const { error } = await supabase
    .from("events")
    .update({ welcome_message: message })
    .eq("id", eventId);
  return !error;
};

export const uploadCoverImage = async (eventId: string, file: File): Promise<string | null> => {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${eventId}/cover.${ext}`;
  const { error } = await supabase.storage
    .from("event-covers")
    .upload(path, file, { upsert: true });
  if (error) {
    console.error("Cover upload error:", error);
    return null;
  }
  const { data } = supabase.storage.from("event-covers").getPublicUrl(path);
  return data.publicUrl;
};

export interface MediaItem {
  id: string;
  event_id: string;
  file_url: string;
  type: "image" | "video";
  uploader_name: string;
  uploaded_at: string;
}

export const fetchEventMedia = async (eventId: string): Promise<MediaItem[]> => {
  const { data, error } = await supabase
    .from("event_media")
    .select("*")
    .eq("event_id", eventId)
    .order("uploaded_at", { ascending: false });
  if (error) return [];
  return (data || []) as MediaItem[];
};

const getUploadMimeType = (blob: Blob, type: "image" | "video") => {
  const fallback = type === "image" ? "image/jpeg" : "video/webm";
  return (blob.type || fallback).split(";")[0].toLowerCase();
};

const getUploadExtension = (mimeType: string, type: "image" | "video") => {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("quicktime")) return "mov";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("heic")) return "heic";
  return type === "image" ? "jpg" : "webm";
};

export const uploadMedia = async (
  eventId: string,
  blob: Blob,
  type: "image" | "video",
  uploaderName: string
): Promise<MediaItem | null> => {
  const id = `media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mimeType = getUploadMimeType(blob, type);
  const ext = getUploadExtension(mimeType, type);
  const path = `${eventId}/${id}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("event-media")
    .upload(path, blob, { contentType: mimeType });
  if (uploadError) {
    console.error("Media upload error:", uploadError);
    return null;
  }

  const { data: urlData } = supabase.storage.from("event-media").getPublicUrl(path);
  const fileUrl = urlData.publicUrl;

  const item: MediaItem = {
    id,
    event_id: eventId,
    file_url: fileUrl,
    type,
    uploader_name: uploaderName || "Guest",
    uploaded_at: new Date().toISOString(),
  };

  const { error: insertError } = await supabase.from("event_media").insert(item);
  if (insertError) {
    console.error("Media record insert error:", insertError);
    return null;
  }

  return item;
};

export const deleteMedia = async (mediaId: string): Promise<boolean> => {
  const { error } = await supabase.from("event_media").delete().eq("id", mediaId);
  return !error;
};

export const clearEventMedia = async (eventId: string): Promise<boolean> => {
  const { error } = await supabase.from("event_media").delete().eq("event_id", eventId);
  if (error) return false;
  // Also clear storage folder
  const { data: files } = await supabase.storage.from("event-media").list(eventId);
  if (files && files.length > 0) {
    const paths = files.map((f) => `${eventId}/${f.name}`);
    await supabase.storage.from("event-media").remove(paths);
  }
  return true;
};

// ── Showcase media (admin-uploaded photos/videos for event page) ──

export interface ShowcaseMediaItem {
  id: string;
  event_id: string;
  file_url: string;
  type: "image" | "video";
  sort_order: number;
  created_at: string;
}

export const fetchShowcaseMedia = async (eventId: string): Promise<ShowcaseMediaItem[]> => {
  const { data, error } = await supabase
    .from("event_showcase_media")
    .select("*")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });
  if (error) return [];
  return (data || []) as ShowcaseMediaItem[];
};

export const uploadShowcaseMedia = async (
  eventId: string,
  file: File
): Promise<ShowcaseMediaItem | null> => {
  const id = `showcase-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${eventId}/showcase/${id}.${ext}`;
  const type: "image" | "video" = file.type.startsWith("video") ? "video" : "image";

  const { error: uploadError } = await supabase.storage
    .from("event-media")
    .upload(path, file, { contentType: file.type });
  if (uploadError) {
    console.error("Showcase upload error:", uploadError);
    return null;
  }

  const { data: urlData } = supabase.storage.from("event-media").getPublicUrl(path);

  const item: ShowcaseMediaItem = {
    id,
    event_id: eventId,
    file_url: urlData.publicUrl,
    type,
    sort_order: 0,
    created_at: new Date().toISOString(),
  };

  const { error: insertError } = await supabase
    .from("event_showcase_media")
    .insert({ event_id: eventId, file_url: item.file_url, type: item.type, sort_order: item.sort_order });
  if (insertError) {
    console.error("Showcase insert error:", insertError);
    return null;
  }

  return item;
};

export const deleteShowcaseMedia = async (mediaId: string): Promise<boolean> => {
  const { error } = await supabase.from("event_showcase_media").delete().eq("id", mediaId);
  return !error;
};
