import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const SUPABASE_URL = 'https://irmestpjsyuwmezlhzug.supabase.co';
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlybWVzdHBqc3l1d21lemxoenVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNDUwMTMsImV4cCI6MjA5NzYyMTAxM30.4wlBSmJjoZ3dbYmyfmFCKaQEA-Pz_NhbHrfXVoH1FNc";

// On web, use localStorage; on native use AsyncStorage.
// This avoids the "window is not defined" crash during SSR/web bundling.
const storage = Platform.OS === 'web'
  ? {
      getItem: (key: string) => Promise.resolve(typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null),
      setItem: (key: string, value: string) => Promise.resolve(typeof localStorage !== 'undefined' ? localStorage.setItem(key, value) : undefined),
      removeItem: (key: string) => Promise.resolve(typeof localStorage !== 'undefined' ? localStorage.removeItem(key) : undefined),
    }
  : AsyncStorage;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  // Disable realtime on web to avoid the Node.js WebSocket error during SSR/bundling.
  // Realtime is not used in this app; auth and data queries use the REST API.
  realtime: { params: { eventsPerSecond: -1 } },
  global: {
    fetch: typeof fetch !== 'undefined' ? fetch : undefined,
  },
});
