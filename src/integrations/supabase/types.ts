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
    PostgrestVersion: "14.17"
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
      ai_reviews: {
        Row: {
          created_at: string
          evaluation_id: string | null
          id: string
          next_time: string
          review_type: string
          summary: string
          trade_id: string | null
          user_id: string
          what_failed: string
          what_learned: string
          what_worked: string
        }
        Insert: {
          created_at?: string
          evaluation_id?: string | null
          id?: string
          next_time?: string
          review_type: string
          summary?: string
          trade_id?: string | null
          user_id: string
          what_failed?: string
          what_learned?: string
          what_worked?: string
        }
        Update: {
          created_at?: string
          evaluation_id?: string | null
          id?: string
          next_time?: string
          review_type?: string
          summary?: string
          trade_id?: string | null
          user_id?: string
          what_failed?: string
          what_learned?: string
          what_worked?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_reviews_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_reviews_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_settings: {
        Row: {
          ai_daily_limit: number
          id: boolean
          updated_at: string
        }
        Insert: {
          ai_daily_limit?: number
          id?: boolean
          updated_at?: string
        }
        Update: {
          ai_daily_limit?: number
          id?: boolean
          updated_at?: string
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
          calculated_at: string | null
          classification: string | null
          contract_size: number | null
          created_at: string
          currency: string | null
          decision: string | null
          direction: string | null
          discipline_status: string | null
          emotional_stop: boolean
          entry_price: number | null
          exit_price: number | null
          fees: number | null
          followed_plan: string | null
          gross_pnl: number | null
          hard_rules: string[]
          id: string
          idea: string | null
          leverage: number | null
          lot_size: number | null
          margin: number | null
          market: string | null
          market_type: string | null
          net_pnl: number | null
          notes: string | null
          notional_value: number | null
          planned_rr: number | null
          post_trade_inputs: Json
          price_change_percent: number | null
          quantity: number | null
          realized_rr: number | null
          result_money: number | null
          result_r: number | null
          review: Json
          risk: Json
          risk_amount: number | null
          risk_percent: number | null
          roi_margin: number | null
          score: number | null
          session: string | null
          setup: string | null
          status: string
          stop_loss: number | null
          take_profit: number | null
          trade_date: string
          trade_no: number | null
          trade_result: string | null
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
          calculated_at?: string | null
          classification?: string | null
          contract_size?: number | null
          created_at?: string
          currency?: string | null
          decision?: string | null
          direction?: string | null
          discipline_status?: string | null
          emotional_stop?: boolean
          entry_price?: number | null
          exit_price?: number | null
          fees?: number | null
          followed_plan?: string | null
          gross_pnl?: number | null
          hard_rules?: string[]
          id?: string
          idea?: string | null
          leverage?: number | null
          lot_size?: number | null
          margin?: number | null
          market?: string | null
          market_type?: string | null
          net_pnl?: number | null
          notes?: string | null
          notional_value?: number | null
          planned_rr?: number | null
          post_trade_inputs?: Json
          price_change_percent?: number | null
          quantity?: number | null
          realized_rr?: number | null
          result_money?: number | null
          result_r?: number | null
          review?: Json
          risk?: Json
          risk_amount?: number | null
          risk_percent?: number | null
          roi_margin?: number | null
          score?: number | null
          session?: string | null
          setup?: string | null
          status?: string
          stop_loss?: number | null
          take_profit?: number | null
          trade_date?: string
          trade_no?: number | null
          trade_result?: string | null
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
          calculated_at?: string | null
          classification?: string | null
          contract_size?: number | null
          created_at?: string
          currency?: string | null
          decision?: string | null
          direction?: string | null
          discipline_status?: string | null
          emotional_stop?: boolean
          entry_price?: number | null
          exit_price?: number | null
          fees?: number | null
          followed_plan?: string | null
          gross_pnl?: number | null
          hard_rules?: string[]
          id?: string
          idea?: string | null
          leverage?: number | null
          lot_size?: number | null
          margin?: number | null
          market?: string | null
          market_type?: string | null
          net_pnl?: number | null
          notes?: string | null
          notional_value?: number | null
          planned_rr?: number | null
          post_trade_inputs?: Json
          price_change_percent?: number | null
          quantity?: number | null
          realized_rr?: number | null
          result_money?: number | null
          result_r?: number | null
          review?: Json
          risk?: Json
          risk_amount?: number | null
          risk_percent?: number | null
          roi_margin?: number | null
          score?: number | null
          session?: string | null
          setup?: string | null
          status?: string
          stop_loss?: number | null
          take_profit?: number | null
          trade_date?: string
          trade_no?: number | null
          trade_result?: string | null
          trade_time?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      library_documents: {
        Row: {
          block: string
          created_at: string
          created_by: string
          description: string
          id: string
          size: number
          sort_order: number
          storage_path: string
          title: string
        }
        Insert: {
          block: string
          created_at?: string
          created_by: string
          description?: string
          id?: string
          size?: number
          sort_order?: number
          storage_path: string
          title: string
        }
        Update: {
          block?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          size?: number
          sort_order?: number
          storage_path?: string
          title?: string
        }
        Relationships: []
      }
      payment_plans: {
        Row: {
          access_plan: Database["public"]["Enums"]["access_plan"]
          description: string
          duration_days: number | null
          is_active: boolean
          is_promo: boolean
          key: string
          name: string
          price_pyg: number
          promo_limit: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          access_plan: Database["public"]["Enums"]["access_plan"]
          description?: string
          duration_days?: number | null
          is_active?: boolean
          is_promo?: boolean
          key: string
          name: string
          price_pyg: number
          promo_limit?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          access_plan?: Database["public"]["Enums"]["access_plan"]
          description?: string
          duration_days?: number | null
          is_active?: boolean
          is_promo?: boolean
          key?: string
          name?: string
          price_pyg?: number
          promo_limit?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      payment_requests: {
        Row: {
          access_plan: Database["public"]["Enums"]["access_plan"]
          amount: number
          created_at: string
          currency: string
          duration_days: number | null
          id: string
          notes: string | null
          payment_method: string
          plan_key: string
          plan_name: string
          receipt_path: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          access_plan: Database["public"]["Enums"]["access_plan"]
          amount: number
          created_at?: string
          currency?: string
          duration_days?: number | null
          id?: string
          notes?: string | null
          payment_method?: string
          plan_key: string
          plan_name: string
          receipt_path?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          access_plan?: Database["public"]["Enums"]["access_plan"]
          amount?: number
          created_at?: string
          currency?: string
          duration_days?: number | null
          id?: string
          notes?: string | null
          payment_method?: string
          plan_key?: string
          plan_name?: string
          receipt_path?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_requests_plan_key_fkey"
            columns: ["plan_key"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["key"]
          },
        ]
      }
      payment_settings: {
        Row: {
          account_number: string
          alias: string
          bank_name: string
          holder_name: string
          id: boolean
          instructions: string
          updated_at: string
        }
        Insert: {
          account_number?: string
          alias?: string
          bank_name?: string
          holder_name?: string
          id?: boolean
          instructions?: string
          updated_at?: string
        }
        Update: {
          account_number?: string
          alias?: string
          bank_name?: string
          holder_name?: string
          id?: boolean
          instructions?: string
          updated_at?: string
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
      admin_approve_payment: {
        Args: { _admin: string; _request: string }
        Returns: string
      }
      admin_approve_user: {
        Args: {
          _admin: string
          _days?: number
          _plan: Database["public"]["Enums"]["access_plan"]
          _target: string
        }
        Returns: undefined
      }
      admin_change_plan: {
        Args: {
          _admin: string
          _days?: number
          _plan: Database["public"]["Enums"]["access_plan"]
          _target: string
        }
        Returns: undefined
      }
      admin_reactivate_user: {
        Args: { _admin: string; _target: string }
        Returns: string
      }
      admin_reject_payment: {
        Args: { _admin: string; _reason?: string; _request: string }
        Returns: undefined
      }
      admin_reject_user: {
        Args: { _admin: string; _reason?: string; _target: string }
        Returns: undefined
      }
      admin_renew_user: {
        Args: { _admin: string; _days: number; _target: string }
        Returns: string
      }
      admin_suspend_user: {
        Args: {
          _admin: string
          _reason?: string
          _revoke?: boolean
          _target: string
        }
        Returns: undefined
      }
      attach_payment_receipt: {
        Args: { _path: string; _request: string; _user: string }
        Returns: undefined
      }
      cancel_my_payment_request: {
        Args: { _request: string; _user: string }
        Returns: undefined
      }
      create_payment_request: {
        Args: { _notes?: string; _plan_key: string; _user: string }
        Returns: string
      }
      enqueue_email: {
        Args: { _payload?: Json; _template: string; _user_id: string }
        Returns: undefined
      }
      expire_overdue_accounts: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      launch_promo_status: {
        Args: never
        Returns: {
          taken: number
          total: number
        }[]
      }
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
