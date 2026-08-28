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
      exercises: {
        Row: {
          category: string
          created_at: string | null
          id: string
          instructions: string | null
          is_bodyweight: boolean | null
          met_value: number | null
          muscle_group_id: number | null
          name: string
          name_en: string | null
          secondary_muscle_group_ids: number[] | null
          user_id: string | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          id?: string
          instructions?: string | null
          is_bodyweight?: boolean | null
          met_value?: number | null
          muscle_group_id?: number | null
          name: string
          name_en?: string | null
          secondary_muscle_group_ids?: number[] | null
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          instructions?: string | null
          is_bodyweight?: boolean | null
          met_value?: number | null
          muscle_group_id?: number | null
          name?: string
          name_en?: string | null
          secondary_muscle_group_ids?: number[] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercises_muscle_group_id_fkey"
            columns: ["muscle_group_id"]
            isOneToOne: false
            referencedRelation: "muscle_groups"
            referencedColumns: ["id"]
          },
        ]
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
          is_countable: boolean
          is_verified: boolean | null
          name: string
          name_en: string | null
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
          is_countable?: boolean
          is_verified?: boolean | null
          name: string
          name_en?: string | null
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
          is_countable?: boolean
          is_verified?: boolean | null
          name?: string
          name_en?: string | null
          protein?: number
          serving_size?: number
          serving_unit?: string
          user_id?: string | null
        }
        Relationships: []
      }
      food_aliases: {
        Row: {
          corpus_fdc_id: string | null
          created_at: string | null
          food_item_id: string | null
          id: string
          phrase: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          corpus_fdc_id?: string | null
          created_at?: string | null
          food_item_id?: string | null
          id?: string
          phrase: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          corpus_fdc_id?: string | null
          created_at?: string | null
          food_item_id?: string | null
          id?: string
          phrase?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_aliases_corpus_fdc_id_fkey"
            columns: ["corpus_fdc_id"]
            isOneToOne: false
            referencedRelation: "food_corpus"
            referencedColumns: ["fdc_id"]
          },
          {
            foreignKeyName: "food_aliases_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
        ]
      }
      food_corpus: {
        Row: {
          carbs: number
          created_at: string | null
          dataset: string
          description: string
          fat: number
          fdc_id: string
          fiber: number
          kcal: number
          measure_grams: number[]
          protein: number
          search_text: string
        }
        Insert: {
          carbs?: number
          created_at?: string | null
          dataset: string
          description: string
          fat?: number
          fdc_id: string
          fiber?: number
          kcal: number
          measure_grams?: number[]
          protein?: number
          search_text: string
        }
        Update: {
          carbs?: number
          created_at?: string | null
          dataset?: string
          description?: string
          fat?: number
          fdc_id?: string
          fiber?: number
          kcal?: number
          measure_grams?: number[]
          protein?: number
          search_text?: string
        }
        Relationships: []
      }
      food_gaps: {
        Row: {
          hits: number
          id: string
          last_seen: string | null
          phrase: string
          reason: string
          user_id: string | null
        }
        Insert: {
          hits?: number
          id?: string
          last_seen?: string | null
          phrase: string
          reason: string
          user_id?: string | null
        }
        Update: {
          hits?: number
          id?: string
          last_seen?: string | null
          phrase?: string
          reason?: string
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
          parse_trace: Json | null
          parse_version: string | null
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
          parse_trace?: Json | null
          parse_version?: string | null
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
          parse_trace?: Json | null
          parse_version?: string | null
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
      nutrition_feedback: {
        Row: {
          created_at: string
          expected_grams: number | null
          expected_kcal: number | null
          id: string
          item_grams: number | null
          item_kcal: number | null
          item_label: string | null
          item_ref_id: string | null
          item_source: string | null
          kind: string
          meal_id: string | null
          note: string | null
          parse_version: string | null
          phrase: string
          raw_input: string | null
          status: string
          trace: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expected_grams?: number | null
          expected_kcal?: number | null
          id?: string
          item_grams?: number | null
          item_kcal?: number | null
          item_label?: string | null
          item_ref_id?: string | null
          item_source?: string | null
          kind: string
          meal_id?: string | null
          note?: string | null
          parse_version?: string | null
          phrase: string
          raw_input?: string | null
          status?: string
          trace?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          expected_grams?: number | null
          expected_kcal?: number | null
          id?: string
          item_grams?: number | null
          item_kcal?: number | null
          item_label?: string | null
          item_ref_id?: string | null
          item_source?: string | null
          kind?: string
          meal_id?: string | null
          note?: string | null
          parse_version?: string | null
          phrase?: string
          raw_input?: string | null
          status?: string
          trace?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_feedback_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
        ]
      }
      portion_memory: {
        Row: {
          grams: number
          phrase: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          grams: number
          phrase: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          grams?: number
          phrase?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      muscle_groups: {
        Row: {
          body_region: string
          id: number
          name: string
          name_en: string
        }
        Insert: {
          body_region: string
          id?: number
          name: string
          name_en: string
        }
        Update: {
          body_region?: string
          id?: number
          name?: string
          name_en?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          block_reminder_enabled: boolean | null
          block_reminder_minutes: number | null
          created_at: string | null
          digest_enabled: boolean | null
          digest_hour: number | null
          evening_enabled: boolean | null
          evening_hour: number | null
          midday_enabled: boolean | null
          midday_hour: number | null
          timezone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          block_reminder_enabled?: boolean | null
          block_reminder_minutes?: number | null
          created_at?: string | null
          digest_enabled?: boolean | null
          digest_hour?: number | null
          evening_enabled?: boolean | null
          evening_hour?: number | null
          midday_enabled?: boolean | null
          midday_hour?: number | null
          timezone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          block_reminder_enabled?: boolean | null
          block_reminder_minutes?: number | null
          created_at?: string | null
          digest_enabled?: boolean | null
          digest_hour?: number | null
          evening_enabled?: boolean | null
          evening_hour?: number | null
          midday_enabled?: boolean | null
          midday_hour?: number | null
          timezone?: string | null
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
      payment_history: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          description: string | null
          error_message: string | null
          id: string
          iyzico_conversation_id: string | null
          iyzico_payment_id: string | null
          iyzico_payment_transaction_id: string | null
          paytr_merchant_oid: string | null
          plan: string | null
          status: string
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          description?: string | null
          error_message?: string | null
          id?: string
          iyzico_conversation_id?: string | null
          iyzico_payment_id?: string | null
          iyzico_payment_transaction_id?: string | null
          paytr_merchant_oid?: string | null
          plan?: string | null
          status: string
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          description?: string | null
          error_message?: string | null
          id?: string
          iyzico_conversation_id?: string | null
          iyzico_payment_id?: string | null
          iyzico_payment_transaction_id?: string | null
          paytr_merchant_oid?: string | null
          plan?: string | null
          status?: string
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_history_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      program_days: {
        Row: {
          created_at: string | null
          day_name: string
          day_number: number
          id: string
          is_rest: boolean | null
          program_id: string
        }
        Insert: {
          created_at?: string | null
          day_name: string
          day_number: number
          id?: string
          is_rest?: boolean | null
          program_id: string
        }
        Update: {
          created_at?: string | null
          day_name?: string
          day_number?: number
          id?: string
          is_rest?: boolean | null
          program_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_days_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "workout_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_exercises: {
        Row: {
          exercise_id: string
          id: string
          notes: string | null
          order_index: number | null
          program_day_id: string
          reps: number | null
          rest_seconds: number | null
          sets: number
        }
        Insert: {
          exercise_id: string
          id?: string
          notes?: string | null
          order_index?: number | null
          program_day_id: string
          reps?: number | null
          rest_seconds?: number | null
          sets?: number
        }
        Update: {
          exercise_id?: string
          id?: string
          notes?: string | null
          order_index?: number | null
          program_day_id?: string
          reps?: number | null
          rest_seconds?: number | null
          sets?: number
        }
        Relationships: [
          {
            foreignKeyName: "program_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_exercises_program_day_id_fkey"
            columns: ["program_day_id"]
            isOneToOne: false
            referencedRelation: "program_days"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string | null
          id: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          cancelled_at: string | null
          created_at: string | null
          currency: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          iyzico_customer_reference_code: string | null
          iyzico_subscription_reference_code: string | null
          iyzico_token: string | null
          paytr_merchant_oid: string | null
          plan: string
          price_usd: number | null
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          cancelled_at?: string | null
          created_at?: string | null
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          iyzico_customer_reference_code?: string | null
          iyzico_subscription_reference_code?: string | null
          iyzico_token?: string | null
          paytr_merchant_oid?: string | null
          plan?: string
          price_usd?: number | null
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          cancelled_at?: string | null
          created_at?: string | null
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          iyzico_customer_reference_code?: string | null
          iyzico_subscription_reference_code?: string | null
          iyzico_token?: string | null
          paytr_merchant_oid?: string | null
          plan?: string
          price_usd?: number | null
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string | null
          user_id?: string
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
          is_recurring: boolean | null
          label: string | null
          notification_sent_at: string | null
          recurrence_days: number[] | null
          recurrence_end: string | null
          recurrence_type: string | null
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
          is_recurring?: boolean | null
          label?: string | null
          notification_sent_at?: string | null
          recurrence_days?: number[] | null
          recurrence_end?: string | null
          recurrence_type?: string | null
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
          is_recurring?: boolean | null
          label?: string | null
          notification_sent_at?: string | null
          recurrence_days?: number[] | null
          recurrence_end?: string | null
          recurrence_type?: string | null
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
      workout_programs: {
        Row: {
          created_at: string | null
          description: string | null
          frequency_per_week: number | null
          id: string
          name: string
          split_type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          frequency_per_week?: number | null
          id?: string
          name: string
          split_type?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          frequency_per_week?: number | null
          id?: string
          name?: string
          split_type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      workout_sets: {
        Row: {
          completed: boolean | null
          created_at: string | null
          distance_m: number | null
          duration_seconds: number | null
          exercise_id: string
          id: string
          notes: string | null
          reps: number | null
          rest_seconds: number | null
          set_number: number
          weight_kg: number | null
          workout_id: string
        }
        Insert: {
          completed?: boolean | null
          created_at?: string | null
          distance_m?: number | null
          duration_seconds?: number | null
          exercise_id: string
          id?: string
          notes?: string | null
          reps?: number | null
          rest_seconds?: number | null
          set_number?: number
          weight_kg?: number | null
          workout_id: string
        }
        Update: {
          completed?: boolean | null
          created_at?: string | null
          distance_m?: number | null
          duration_seconds?: number | null
          exercise_id?: string
          id?: string
          notes?: string | null
          reps?: number | null
          rest_seconds?: number | null
          set_number?: number
          weight_kg?: number | null
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sets_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workouts: {
        Row: {
          ai_plan: Json | null
          created_at: string | null
          date: string
          duration_minutes: number | null
          id: string
          name: string | null
          notes: string | null
          status: string
          total_calories_burned: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_plan?: Json | null
          created_at?: string | null
          date?: string
          duration_minutes?: number | null
          id?: string
          name?: string | null
          notes?: string | null
          status?: string
          total_calories_burned?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_plan?: Json | null
          created_at?: string | null
          date?: string
          duration_minutes?: number | null
          id?: string
          name?: string | null
          notes?: string | null
          status?: string
          total_calories_burned?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_pro_user: { Args: { check_user_id: string }; Returns: boolean }
      record_food_gap: {
        Args: { p_phrase: string; p_reason: string; p_user: string }
        Returns: undefined
      }
      search_food_corpus: {
        Args: { lim?: number; q: string }
        Returns: {
          carbs: number
          dataset: string
          description: string
          fat: number
          fdc_id: string
          fiber: number
          kcal: number
          measure_grams: number[]
          protein: number
          score: number
          search_text: string
        }[]
      }
    }
    Enums: {
      block_type: "task" | "routine" | "break" | "focus" | "meal" | "workout"
      meal_type: "breakfast" | "lunch" | "dinner" | "snack"
      subscription_status:
        | "free"
        | "pro_monthly"
        | "pro_annual"
        | "cancelled"
        | "past_due"
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
      subscription_status: [
        "free",
        "pro_monthly",
        "pro_annual",
        "cancelled",
        "past_due",
      ],
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
