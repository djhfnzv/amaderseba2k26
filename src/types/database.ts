// Hand-maintained until we switch to `supabase gen types typescript`.
// Keep in sync with supabase/migrations.

export type Role = "patient" | "doctor" | "admin";
export type AccountStatus = "active" | "suspended";

export type Database = {
  public: {
    Tables: {
      roles: {
        Row: { id: string; description: string };
        Insert: { id: string; description: string };
        Update: { id?: string; description?: string };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          role: Role;
          full_name: string;
          email: string | null;
          phone: string | null;
          avatar_url: string | null;
          status: AccountStatus;
          suspended_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          full_name?: string;
          avatar_url?: string | null;
          role?: Role;
          status?: AccountStatus;
          suspended_reason?: string | null;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      current_user_role: { Args: Record<string, never>; Returns: string };
      is_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: { account_status: AccountStatus };
    CompositeTypes: { [_ in never]: never };
  };
};

export type AppUser = Database["public"]["Tables"]["users"]["Row"];
