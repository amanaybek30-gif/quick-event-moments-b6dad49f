
-- Table for admin-uploaded showcase photos/videos displayed on the event page
CREATE TABLE public.event_showcase_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  type text NOT NULL CHECK (type IN ('image', 'video')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.event_showcase_media ENABLE ROW LEVEL SECURITY;

-- Everyone can view showcase media (guests see it on event page)
CREATE POLICY "Showcase media is viewable by everyone"
  ON public.event_showcase_media FOR SELECT
  USING (true);

-- Anyone can insert (admin uploads via client)
CREATE POLICY "Showcase media can be uploaded"
  ON public.event_showcase_media FOR INSERT
  WITH CHECK (true);

-- Anyone can delete (admin deletes)
CREATE POLICY "Showcase media can be deleted"
  ON public.event_showcase_media FOR DELETE
  USING (true);

-- Index for fast event lookups
CREATE INDEX idx_event_showcase_media_event_id ON public.event_showcase_media(event_id);
