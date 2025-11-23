// supabaseClient.js
const SUPABASE_URL = 'https://mvltmbctvumuzacpwvoh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12bHRtYmN0dnVtdXphY3B3dm9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4NzMxODMsImV4cCI6MjA3ODQ0OTE4M30.Xbh0DggZIlmwGdM6j-rbql_Z7EnnPiffmtJTqRIfmPc';

window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);