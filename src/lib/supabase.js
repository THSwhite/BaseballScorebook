import { createClient } from '@supabase/supabase-js'

// 全專案只在這裡建立一次連線
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)