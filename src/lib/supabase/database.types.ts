export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      files: {
        Row: {
          created_at: string;
          id: string;
          mime_type: string;
          name: string;
          owner_id: string;
          size_bytes: number;
          storage_path: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          mime_type: string;
          name: string;
          owner_id?: string;
          size_bytes: number;
          storage_path: string;
        };
        Update: never;
        Relationships: [];
      };
      app_owner: {
        Row: {
          id: number;
          user_id: string;
        };
        Insert: {
          id: number;
          user_id: string;
        };
        Update: never;
        Relationships: [];
      };
      app_settings: {
        Row: {
          accent_color: string;
          display_name: string;
          owner_id: string;
          updated_at: string;
        };
        Insert: {
          accent_color?: string;
          display_name?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Update: {
          accent_color?: string;
          display_name?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_app_owner: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
