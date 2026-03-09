import { createClient } from '@supabase/supabase-js';

const getSupabaseConfig = () => {
  try {
    const storedUrl = localStorage.getItem('SUPABASE_URL');
    const storedKey = localStorage.getItem('SUPABASE_ANON_KEY');

    return {
      url: storedUrl || import.meta.env.VITE_SUPABASE_URL || '',
      key: storedKey || import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    };
  } catch {
    return {
      url: import.meta.env.VITE_SUPABASE_URL || '',
      key: import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    };
  }
};

const { url: supabaseUrl, key: supabaseAnonKey } = getSupabaseConfig();

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;

if (!isSupabaseConfigured) {
  console.error('ERROR: Supabase configuration is missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.');
} else {
  console.log('Supabase configured with URL:', supabaseUrl);
}

// Use placeholders if not configured to avoid crashing the app at boot
export const supabase = createClient(
  supabaseUrl || 'https://placeholder-project.supabase.co',
  supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy-anon-key'
);

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          username: string;
          password: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          username: string;
          password: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          username?: string;
          password?: string;
          updated_at?: string;
        };
      };
      liked_properties: {
        Row: {
          id: string;
          user_id: string;
          property_data: Record<string, any>;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          property_data: Record<string, any>;
          created_at?: string;
        };
        Update: {
          property_data?: Record<string, any>;
        };
      };
      disliked_properties: {
        Row: {
          id: string;
          user_id: string;
          property_data: Record<string, any>;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          property_data: Record<string, any>;
          created_at?: string;
        };
        Update: {
          property_data?: Record<string, any>;
        };
      };
      invites: {
        Row: {
          id: string;
          to_user_id: string;
          from_user_id: string;
          from_username: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          to_user_id: string;
          from_user_id: string;
          from_username: string;
          created_at?: string;
        };
      };
      roommates: {
        Row: {
          id: string;
          user_a_id: string;
          user_b_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_a_id: string;
          user_b_id: string;
          created_at?: string;
        };
      };
      matches: {
        Row: {
          id: string;
          user_a_id: string;
          user_b_id: string;
          property_data: Record<string, any>;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_a_id: string;
          user_b_id: string;
          property_data: Record<string, any>;
          created_at?: string;
        };
      };
      property_rankings: {
        Row: {
          id: string;
          user_id: string;
          property_id: string;
          ranking_position: number;
          notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          property_id: string;
          ranking_position: number;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          ranking_position?: number;
          notes?: string;
          updated_at?: string;
        };
      };
      property_tags: {
        Row: {
          id: string;
          user_id: string;
          property_id: string;
          tag: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          property_id: string;
          tag: string;
          created_at?: string;
        };
      };
      visits: {
        Row: {
          id: string;
          user_id: string;
          address: string;
          visit_date: string;
          visit_time: string;
          property_price: string;
          notes: string;
          property_data: Record<string, any> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          address: string;
          visit_date: string;
          visit_time: string;
          property_price?: string;
          notes?: string;
          property_data?: Record<string, any> | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          address?: string;
          visit_date?: string;
          visit_time?: string;
          property_price?: string;
          notes?: string;
          property_data?: Record<string, any> | null;
          updated_at?: string;
        };
      };
      ranking_preferences: {
        Row: {
          id: string;
          user_id: string;
          pref_tamanho_value: number | null;
          pref_tamanho_priority: number;
          pref_quartos_value: number | null;
          pref_quartos_priority: number;
          pref_banheiros_value: number | null;
          pref_banheiros_priority: number;
          pref_distancia_value: number | null;
          pref_distancia_priority: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          pref_tamanho_value?: number | null;
          pref_tamanho_priority?: number;
          pref_quartos_value?: number | null;
          pref_quartos_priority?: number;
          pref_banheiros_value?: number | null;
          pref_banheiros_priority?: number;
          pref_distancia_value?: number | null;
          pref_distancia_priority?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          pref_tamanho_value?: number | null;
          pref_tamanho_priority?: number;
          pref_quartos_value?: number | null;
          pref_quartos_priority?: number;
          pref_banheiros_value?: number | null;
          pref_banheiros_priority?: number;
          pref_distancia_value?: number | null;
          pref_distancia_priority?: number;
          updated_at?: string;
        };
      };
    };
  };
};
