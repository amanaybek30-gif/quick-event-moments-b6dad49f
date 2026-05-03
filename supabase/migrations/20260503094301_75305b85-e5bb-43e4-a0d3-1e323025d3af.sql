ALTER TABLE public.events ADD COLUMN qr_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.events ADD COLUMN welcome_title text DEFAULT 'Welcome!';