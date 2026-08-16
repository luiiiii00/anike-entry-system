export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          details: Json
          id: string
          target_user_id: string
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          details?: Json
          id?: string
          target_user_id: string
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          details?: Json
          id?: string
          target_user_id?: string
        }
        Relationships: []
      }
      email_outbox: {
        Row: {
          created_at: string
          error: string | null
          id: string
          payload: Json
          sent_at: string | null
          status: string
          template: string
          to_email: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json
          sent_at?: string | null
          status?: string
          template: string
          to_email: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json
          sent_at?: string | null
          status?: string
          template?: string
          to_email?: string
          user_id?: string
        }
        Relationships: []
      }
      evaluations: {
        Row: {
          after_screenshot_url: string | null
          answers: Json
          asset: string | null
          before_screenshot_url: string | null
          breakdown: Json
          classification: string | null
          created_at: string
          decision: string | null
          direction: string | null
          discipline_status: string | null
          emotional_stop: boolean
          followed_plan: string | null
          hard_rules: string[]
          id: string
          idea: string | null
          market: string | null
          notes: string | null
          result_money: number | null
          result_r: number | null
          review: Json
          risk: Json
          score: number | null
          session: string | null
          setup: string | null
          status: string
          trade_date: string
          trade_no: number | null
          trade_time: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          after_screenshot_url?: string | null
          answers?: Json
          asset?: string | null
          before_screenshot_url?: string | null
          breakdown?: Json
          classification?: string | null
          created_at?: string
          decision?: string | null
          direction?: string | null
          discipline_status?: string | null
          emotional_stop?: boolean
          followed_plan?: string | null
          hard_rules?: string[]
          id?: string
          idea?: string | null
          market?: string | null
          notes?: string | null
          result_money?: number | null
          result_r?: number | null
          review?: Json
          risk?: Json
          score?: number | null
          session?: string | null
          setup?: string | null
          status?: string
          trade_date?: string
          trade_no?: number | null
          trade_time?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          after_screenshot_url?: string | null
          answers?: Json
          asset?: string | null
          before_screenshot_url?: string | null
          breakdown?: Json
          classification?: string | null
          created_at?: string
          decision?: string | null
          direction?: string | null
          discipline_status?: string | null
          emotional_stop?: boolean
          followed_plan?: string | null
          hard_rules?: string[]
          id?: string
          idea?: string | null
          market?: string | null
          notes?: string | null
          result_money?: number | null
          result_r?: number | null
          review?: Json
          risk?: Json
          score?: number | null
          session?: string | null
          setup?: string | null
          status?: string
          trade_date?: string
          trade_no?: number | null
          trade_time?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          access_expiration: string | null
          access_start: string | null
          approved_at: string | null
          created_at: string
          display_name: string | null
          email: string | null
          full_name: string | null
          id: string
          last_seen_at: string | null
          plan: Database["public"]["Enums"]["access_plan"]
          rejection_reason: string | null
          requested_plan: Database["public"]["Enums"]["access_plan"]
          status: Database["public"]["Enums"]["account_status"]
          suspension_reason: string | null
          updated_at: string
        }
        Insert: {
          access_expiration?: string | null
          access_start?: string | null
          approved_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          last_seen_at?: string | null
          plan?: Database["public"]["Enums"]["access_plan"]
          rejection_reason?: string | null
          requested_plan?: Database["public"]["Enums"]["access_plan"]
          status?: Database["public"]["Enums"]["account_status"]
          suspension_reason?: string | null
          updated_at?: string
        }
        Update: {
          access_expiration?: string | null
          access_start?: string | null
          approved_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          last_seen_at?: string | null
          plan?: Database["public"]["Enums"]["access_plan"]
          rejection_reason?: string | null
          requested_plan?: Database["public"]["Enums"]["access_plan"]
          status?: Database["public"]["Enums"]["account_status"]
          suspension_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          account_capital: number
          currency: string
          max_daily_trades: number
          max_risk_pct: number
          min_rr: number
          preferred_setups: string[]
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_capital?: number
          currency?: string
          max_daily_trades?: number
          max_risk_pct?: number
          min_rr?: number
          preferred_setups?: string[]
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_capital?: number
          currency?: string
          max_daily_trades?: number
          max_risk_pct?: number
          min_rr?: number
          preferred_setups?: string[]
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weekly_reviews: {
        Row: {
          average_r: number | null
          average_score: number | null
          best_setup: string | null
          biggest_mistake: string | null
          biggest_success: string | null
          created_at: string
          id: string
          impulsive_trades: number | null
          next_week_action: string | null
          notes: Json
          number_of_trades: number | null
          off_plan_trades: number | null
          updated_at: string
          user_id: string
          week_end: string | null
          week_start: string
          win_rate: number | null
          worst_setup: string | null
        }
        Insert: {
          average_r?: number | null
          average_score?: number | null
          best_setup?: string | null
          biggest_mistake?: string | null
          biggest_success?: string | null
          created_at?: string
          id?: string
          impulsive_trades?: number | null
          next_week_action?: string | null
          notes?: Json
          number_of_trades?: number | null
          off_plan_trades?: number | null
          updated_at?: string
          user_id: string
          week_end?: string | null
          week_start: string
          win_rate?: number | null
          worst_setup?: string | null
        }
        Update: {
          average_r?: number | null
          average_score?: number | null
          best_setup?: string | null
          biggest_mistake?: string | null
          biggest_success?: string | null
          created_at?: string
          id?: string
          impulsive_trades?: number | null
          next_week_action?: string | null
          notes?: Json
          number_of_trades?: number | null
          off_plan_trades?: number | null
          updated_at?: string
          user_id?: string
          week_end?: string | null
          week_start?: string
          win_rate?: number | null
          worst_setup?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_approve_user: {
        Args: {
          _days?: number
          _plan: Database["public"]["Enums"]["access_plan"]
          _target: string
        }
        Returns: undefined
      }
      admin_change_plan: {
        Args: {
          _days?: number
          _plan: Database["public"]["Enums"]["access_plan"]
          _target: string
        }
        Returns: undefined
      }
      admin_log: {
        Args: { _action: string; _details: Json; _target: string }
        Returns: undefined
      }
      admin_reactivate_user: { Args: { _target: string }; Returns: string }
      admin_reject_user: {
        Args: { _reason?: string; _target: string }
        Returns: undefined
      }
      admin_renew_user: {
        Args: { _days: number; _target: string }
        Returns: string
      }
      admin_suspend_user: {
        Args: { _reason?: string; _revoke?: boolean; _target: string }
        Returns: undefined
      }
      enqueue_email: {
        Args: { _payload?: Json; _template: string; _user_id: string }
        Returns: undefined
      }
      expire_overdue_accounts: { Args: never; Returns: number }
      has_active_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      access_plan: "NONE" | "PRO" | "LIFETIME"
      account_status:
        | "PENDING"
        | "APPROVED"
        | "REJECTED"
        | "SUSPENDED"
        | "EXPIRED"
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      access_plan: ["NONE", "PRO", "LIFETIME"],
      account_status: [
        "PENDING",
        "APPROVED",
        "REJECTED",
        "SUSPENDED",
        "EXPIRED",
      ],
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
