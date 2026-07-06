// ============================================================================
// FloMap configuration
// ----------------------------------------------------------------------------
// 1. Create a free project at https://supabase.com
// 2. In the dashboard open  Project Settings -> API
// 3. Copy the "Project URL" and the "anon public" key into the two constants
//    below.
// 4. Run supabase/schema.sql in the Supabase SQL editor (once).
// ============================================================================

export const SUPABASE_URL = "https://tvksfllwmosaoqpqhkxd.supabase.co";      // e.g. https://abcd1234.supabase.co
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2a3NmbGx3bW9zYW9xcHFoa3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNjc3OTYsImV4cCI6MjA5ODk0Mzc5Nn0.BtkcMkaIJZqed6CtCUc4gvgrWbNEI1D7x8c9tyi4PBk";    // the long "anon public" JWT

// Loaded from a CDN so there is no build step / npm install.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const isConfigured =
  SUPABASE_URL && !SUPABASE_URL.startsWith("YOUR_") &&
  SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith("YOUR_");

// If not configured yet we still export a client-shaped object so imports don't
// explode; the app shows a friendly setup screen instead.
export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
