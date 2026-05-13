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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      daily_plans: {
        Row: {
          ai_suggestions: Json | null
          created_at: string | null
          date: string
          energy_level: number | null
          id: string
          notes: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_suggestions?: Json | null
          created_at?: string | null
          date: string
          energy_level?: number | null
          id?: string
          notes?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_suggestions?: Json | null
          created_at?: string | null
          date?: string
          energy_level?: number | null
          id?: string
          notes?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      food_items: {
        Row: {
          aliases: string[] | null
          calories: number
          carbs: number
          category: string | null
          created_at: string | null
          fat: number
          fiber: number
          id: string
          is_verified: boolean | null
          name: string
          protein: number
          serving_size: number
          serving_unit: string
          user_id: string | null
        }
        Insert: {
          aliases?: string[] | null
          calories: number
          carbs?: number
          category?: string | null
          created_at?: string | null
          fat?: number
          fiber?: number
          id?: string
          is_verified?: boolean | null
          name: string
          protein?: number
          serving_size?: number
          serving_unit?: string
          user_id?: string | null
        }
        Update: {
          aliases?: string[] | null
          calories?: number
          carbs?: number
          category?: string | null
          created_at?: string | null
          fat?: number
          fiber?: number
          id?: string
          is_verified?: boolean | null
          name?: string
          protein?: number
          serving_size?: number
          serving_unit?: string
          user_id?: string | null
        }
        Relationships: []
      }
      meals: {
        Row: {
          created_at: string | null
          date: string
          id: string
          items: Json | null
          meal_type: Database["public"]["Enums"]["meal_type"]
          notes: string | null
          raw_input: string | null
          total_calories: number | null
          total_carbs: number | null
          total_fat: number | null
          total_fiber: number | null
          total_protein: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date?: string
          id?: string
          items?: Json | null
          meal_type: Database["public"]["Enums"]["meal_type"]
          notes?: string | null
          raw_input?: string | null
          total_calories?: number | null
          total_carbs?: number | null
          total_fat?: number | null
          total_fiber?: number | null
          total_protein?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          items?: Json | null
          meal_type?: Database["public"]["Enums"]["meal_type"]
          notes?: string | null
          raw_input?: string | null
          total_calories?: number | null
          total_carbs?: number | null
          total_fat?: number | null
          total_fiber?: number | null
          total_protein?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      nutrition_targets: {
        Row: {
          calories: number
          carbs_g: number
          created_at: string | null
          fat_g: number
          fiber_g: number
          id: string
          is_active: boolean | null
          protein_g: number
          updated_at: string | null
          user_id: string
          workout_day_calories: number | null
          workout_day_protein_g: number | null
        }
        Insert: {
          calories?: number
          carbs_g?: number
          created_at?: string | null
          fat_g?: number
          fiber_g?: number
          id?: string
          is_active?: boolean | null
          protein_g?: number
          updated_at?: string | null
          user_id: string
          workout_day_calories?: number | null
          workout_day_protein_g?: number | null
        }
        Update: {
          calories?: number
          carbs_g?: number
          created_at?: string | null
          fat_g?: number
          fiber_g?: number
          id?: string
          is_active?: boolean | null
          protein_g?: number
          updated_at?: string | null
          user_id?: string
          workout_day_calories?: number | null
          workout_day_protein_g?: number | null
        }
        Relationships: []
      }
      task_details: {
        Row: {
          attachments: Json | null
          checklist: Json | null
          created_at: string | null
          id: string
          notes: string | null
          task_id: string
          updated_at: string | null
        }
        Insert: {
          attachments?: Json | null
          checklist?: Json | null
          created_at?: string | null
          id?: string
          notes?: string | null
          task_id: string
          updated_at?: string | null
        }
        Update: {
          attachments?: Json | null
          checklist?: Json | null
          created_at?: string | null
          id?: string
          notes?: string | null
          task_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_details_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          effort_score: number | null
          estimated_minutes: number | null
          friction_score: number | null
          id: string
          is_recurring: boolean | null
          is_time_blocked: boolean | null
          parent_task_id: string | null
          priority_score: number | null
          recurrence_rule: string | null
          risk_score: number | null
          scheduled_date: string | null
          sort_order: number | null
          status: Database["public"]["Enums"]["task_status"] | null
          tags: string[] | null
          title: string
          updated_at: string | null
          urgency_score: number | null
          user_id: string
          value_score: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          effort_score?: number | null
          estimated_minutes?: number | null
          friction_score?: number | null
          id?: string
          is_recurring?: boolean | null
          is_time_blocked?: boolean | null
          parent_task_id?: string | null
          priority_score?: number | null
          recurrence_rule?: string | null
          risk_score?: number | null
          scheduled_date?: string | null
          sort_order?: number | null
          status?: Database["public"]["Enums"]["task_status"] | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          urgency_score?: number | null
          user_id: string
          value_score?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          effort_score?: number | null
          estimated_minutes?: number | null
          friction_score?: number | null
          id?: string
          is_recurring?: boolean | null
          is_time_blocked?: boolean | null
          parent_task_id?: string | null
          priority_score?: number | null
          recurrence_rule?: string | null
          risk_score?: number | null
          scheduled_date?: string | null
          sort_order?: number | null
          status?: Database["public"]["Enums"]["task_status"] | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          urgency_score?: number | null
          user_id?: string
          value_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      time_blocks: {
        Row: {
          block_type: Database["public"]["Enums"]["block_type"] | null
          color: string | null
          created_at: string | null
          date: string
          end_time: string
          id: string
          label: string | null
          start_time: string
          task_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          block_type?: Database["public"]["Enums"]["block_type"] | null
          color?: string | null
          created_at?: string | null
          date: string
          end_time: string
          id?: string
          label?: string | null
          start_time: string
          task_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          block_type?: Database["public"]["Enums"]["block_type"] | null
          color?: string | null
          created_at?: string | null
          date?: string
          end_time?: string
          id?: string
          label?: string | null
          start_time?: string
          task_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_blocks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          status: 'free' | 'pro_monthly' | 'pro_annual' | 'cancelled' | 'past_due'
          plan: string
          iyzico_subscription_reference_code: string | null
          iyzico_customer_reference_code: string | null
          iyzico_token: string | null
          price_usd: number | null
          currency: string | null
          current_period_start: string | null
          current_period_end: string | null
          cancelled_at: string | null
          cancel_at_period_end: boolean
          trial_ends_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          status?: 'free' | 'pro_monthly' | 'pro_annual' | 'cancelled' | 'past_due'
          plan?: string
          iyzico_token?: string | null
          current_period_start?: string | null
          current_period_end?: string | null
          cancelled_at?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: 'free' | 'pro_monthly' | 'pro_annual' | 'cancelled' | 'past_due'
          plan?: string
          iyzico_token?: string | null
          iyzico_payment_id?: string | null
          current_period_start?: string | null
          current_period_end?: string | null
          cancelled_at?: string | null
          cancel_at_period_end?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      user_profiles: {
        Row: {
          created_at: string | null
          display_name: string | null
          id: string
          preferences: Json | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          id: string
          preferences?: Json | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          preferences?: Json | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      block_type: "task" | "routine" | "break" | "focus" | "meal" | "workout"
      meal_type: "breakfast" | "lunch" | "dinner" | "snack"
      task_status:
        | "backlog"
        | "planned"
        | "in_progress"
        | "blocked"
        | "done"
        | "deferred"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      block_type: ["task", "routine", "break", "focus", "meal", "workout"],
      meal_type: ["breakfast", "lunch", "dinner", "snack"],
      task_status: [
        "backlog",
        "planned",
        "in_progress",
        "blocked",
        "done",
        "deferred",
      ],
    },
  },
} as const
