export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  app_auth: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
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
  pgbouncer: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_auth: {
        Args: {
          p_usename: string
        }
        Returns: {
          username: string
          password: string
        }[]
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
      admin_audit_log: {
        Row: {
          action: string
          actor_auth_user_id: string | null
          actor_profile_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip: unknown | null
          meta: Json
          reason: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_auth_user_id?: string | null
          actor_profile_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip?: unknown | null
          meta?: Json
          reason?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_auth_user_id?: string | null
          actor_profile_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip?: unknown | null
          meta?: Json
          reason?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      analytics_conversions: {
        Row: {
          attribution_campaign: string | null
          attribution_medium: string | null
          attribution_source: string | null
          conversion_currency: string | null
          conversion_type: string
          conversion_value: number | null
          created_at: string | null
          id: string
          metadata: Json | null
          page_url: string | null
          session_id: string
          user_id: string | null
        }
        Insert: {
          attribution_campaign?: string | null
          attribution_medium?: string | null
          attribution_source?: string | null
          conversion_currency?: string | null
          conversion_type: string
          conversion_value?: number | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          page_url?: string | null
          session_id: string
          user_id?: string | null
        }
        Update: {
          attribution_campaign?: string | null
          attribution_medium?: string | null
          attribution_source?: string | null
          conversion_currency?: string | null
          conversion_type?: string
          conversion_value?: number | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          page_url?: string | null
          session_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_conversions_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "analytics_users"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_daily_stats: {
        Row: {
          created_at: string | null
          date: string
          dimensions: Json | null
          id: string
          metric_type: string
          metric_value: number
        }
        Insert: {
          created_at?: string | null
          date: string
          dimensions?: Json | null
          id?: string
          metric_type: string
          metric_value: number
        }
        Update: {
          created_at?: string | null
          date?: string
          dimensions?: Json | null
          id?: string
          metric_type?: string
          metric_value?: number
        }
        Relationships: []
      }
      analytics_device_stats: {
        Row: {
          avg_session_duration: number | null
          bounce_rate: number | null
          browser: string | null
          created_at: string | null
          date: string
          device_type: string
          id: string
          os: string | null
          page_views_count: number | null
          sessions_count: number | null
          users_count: number | null
        }
        Insert: {
          avg_session_duration?: number | null
          bounce_rate?: number | null
          browser?: string | null
          created_at?: string | null
          date: string
          device_type: string
          id?: string
          os?: string | null
          page_views_count?: number | null
          sessions_count?: number | null
          users_count?: number | null
        }
        Update: {
          avg_session_duration?: number | null
          bounce_rate?: number | null
          browser?: string | null
          created_at?: string | null
          date?: string
          device_type?: string
          id?: string
          os?: string | null
          page_views_count?: number | null
          sessions_count?: number | null
          users_count?: number | null
        }
        Relationships: []
      }
      analytics_errors: {
        Row: {
          browser: string | null
          created_at: string | null
          error_message: string | null
          error_stack: string | null
          error_type: string
          id: string
          os: string | null
          page_url: string | null
          resolved: boolean | null
          session_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          browser?: string | null
          created_at?: string | null
          error_message?: string | null
          error_stack?: string | null
          error_type: string
          id?: string
          os?: string | null
          page_url?: string | null
          resolved?: boolean | null
          session_id: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          browser?: string | null
          created_at?: string | null
          error_message?: string | null
          error_stack?: string | null
          error_type?: string
          id?: string
          os?: string | null
          page_url?: string | null
          resolved?: boolean | null
          session_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_errors_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "analytics_users"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string | null
          event_action: string | null
          event_category: string | null
          event_label: string | null
          event_name: string
          event_value: number | null
          id: string
          metadata: Json | null
          page_url: string | null
          session_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_action?: string | null
          event_category?: string | null
          event_label?: string | null
          event_name: string
          event_value?: number | null
          id?: string
          metadata?: Json | null
          page_url?: string | null
          session_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_action?: string | null
          event_category?: string | null
          event_label?: string | null
          event_name?: string
          event_value?: number | null
          id?: string
          metadata?: Json | null
          page_url?: string | null
          session_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "analytics_users"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_geo_stats: {
        Row: {
          bounce_rate: number | null
          city: string | null
          country_code: string | null
          created_at: string | null
          date: string
          id: string
          page_views_count: number | null
          region: string | null
          sessions_count: number | null
          users_count: number | null
        }
        Insert: {
          bounce_rate?: number | null
          city?: string | null
          country_code?: string | null
          created_at?: string | null
          date: string
          id?: string
          page_views_count?: number | null
          region?: string | null
          sessions_count?: number | null
          users_count?: number | null
        }
        Update: {
          bounce_rate?: number | null
          city?: string | null
          country_code?: string | null
          created_at?: string | null
          date?: string
          id?: string
          page_views_count?: number | null
          region?: string | null
          sessions_count?: number | null
          users_count?: number | null
        }
        Relationships: []
      }
      analytics_hourly_stats: {
        Row: {
          created_at: string | null
          date_hour: string
          dimensions: Json | null
          id: string
          metric_type: string
          metric_value: number
        }
        Insert: {
          created_at?: string | null
          date_hour: string
          dimensions?: Json | null
          id?: string
          metric_type: string
          metric_value: number
        }
        Update: {
          created_at?: string | null
          date_hour?: string
          dimensions?: Json | null
          id?: string
          metric_type?: string
          metric_value?: number
        }
        Relationships: []
      }
      analytics_page_views: {
        Row: {
          bounce: boolean | null
          created_at: string | null
          exit_page: boolean | null
          id: string
          load_time: number | null
          page_title: string | null
          page_url: string
          referrer: string | null
          scroll_depth: number | null
          session_id: string
          time_on_page: number | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          bounce?: boolean | null
          created_at?: string | null
          exit_page?: boolean | null
          id?: string
          load_time?: number | null
          page_title?: string | null
          page_url: string
          referrer?: string | null
          scroll_depth?: number | null
          session_id: string
          time_on_page?: number | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          bounce?: boolean | null
          created_at?: string | null
          exit_page?: boolean | null
          id?: string
          load_time?: number | null
          page_title?: string | null
          page_url?: string
          referrer?: string | null
          scroll_depth?: number | null
          session_id?: string
          time_on_page?: number | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_page_views_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "analytics_users"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_performance: {
        Row: {
          browser: string | null
          created_at: string | null
          device_type: string | null
          id: string
          metric_type: string
          metric_value: number | null
          page_url: string
          session_id: string
          user_id: string | null
        }
        Insert: {
          browser?: string | null
          created_at?: string | null
          device_type?: string | null
          id?: string
          metric_type: string
          metric_value?: number | null
          page_url: string
          session_id: string
          user_id?: string | null
        }
        Update: {
          browser?: string | null
          created_at?: string | null
          device_type?: string | null
          id?: string
          metric_type?: string
          metric_value?: number | null
          page_url?: string
          session_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_performance_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "analytics_users"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_sessions: {
        Row: {
          browser: string | null
          city: string | null
          country_code: string | null
          created_at: string | null
          device_type: string | null
          duration: number | null
          end_time: string | null
          entry_page: string | null
          exit_page: string | null
          id: string
          is_bounce: boolean | null
          os: string | null
          page_views: number | null
          referrer: string | null
          session_id: string
          start_time: string | null
          updated_at: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string | null
          device_type?: string | null
          duration?: number | null
          end_time?: string | null
          entry_page?: string | null
          exit_page?: string | null
          id?: string
          is_bounce?: boolean | null
          os?: string | null
          page_views?: number | null
          referrer?: string | null
          session_id: string
          start_time?: string | null
          updated_at?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          browser?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string | null
          device_type?: string | null
          duration?: number | null
          end_time?: string | null
          entry_page?: string | null
          exit_page?: string | null
          id?: string
          is_bounce?: boolean | null
          os?: string | null
          page_views?: number | null
          referrer?: string | null
          session_id?: string
          start_time?: string | null
          updated_at?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_sessions_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "analytics_users"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_users: {
        Row: {
          browser: string | null
          city: string | null
          country_code: string | null
          created_at: string | null
          device_type: string | null
          first_seen: string | null
          id: string
          ip_address: unknown | null
          is_bot: boolean | null
          language: string | null
          last_seen: string | null
          os: string | null
          region: string | null
          screen_height: number | null
          screen_width: number | null
          session_id: string
          timezone: string | null
          updated_at: string | null
          user_agent: string | null
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string | null
          device_type?: string | null
          first_seen?: string | null
          id?: string
          ip_address?: unknown | null
          is_bot?: boolean | null
          language?: string | null
          last_seen?: string | null
          os?: string | null
          region?: string | null
          screen_height?: number | null
          screen_width?: number | null
          session_id: string
          timezone?: string | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Update: {
          browser?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string | null
          device_type?: string | null
          first_seen?: string | null
          id?: string
          ip_address?: unknown | null
          is_bot?: boolean | null
          language?: string | null
          last_seen?: string | null
          os?: string | null
          region?: string | null
          screen_height?: number | null
          screen_width?: number | null
          session_id?: string
          timezone?: string | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      blog_authors: {
        Row: {
          avatar_url: string | null
          bio: Json
          bluesky_url: string | null
          created_at: string
          github_url: string | null
          id: string
          name: string
          slug: string
          updated_at: string
          website_url: string | null
          x_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: Json
          bluesky_url?: string | null
          created_at?: string
          github_url?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
          website_url?: string | null
          x_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: Json
          bluesky_url?: string | null
          created_at?: string
          github_url?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
          website_url?: string | null
          x_url?: string | null
        }
        Relationships: []
      }
      blog_post_images: {
        Row: {
          alt_text: string | null
          bucket_name: string
          created_at: string
          id: string
          object_path: string
          post_id: string | null
        }
        Insert: {
          alt_text?: string | null
          bucket_name?: string
          created_at?: string
          id?: string
          object_path: string
          post_id?: string | null
        }
        Update: {
          alt_text?: string | null
          bucket_name?: string
          created_at?: string
          id?: string
          object_path?: string
          post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_post_images_post_id_fkey"
            columns: ["post_id"]
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_post_tags: {
        Row: {
          post_id: string
          tag_id: string
        }
        Insert: {
          post_id: string
          tag_id: string
        }
        Update: {
          post_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_post_tags_post_id_fkey"
            columns: ["post_id"]
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_post_tags_tag_id_fkey"
            columns: ["tag_id"]
            referencedRelation: "blog_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author: string | null
          author_id: string | null
          content: Json
          content_format: string
          cover_image: string | null
          created_at: string
          excerpt: Json
          id: string
          is_published: boolean
          published_at: string | null
          revision: number
          slug: string
          tags: string[] | null
          title: Json
          updated_at: string
        }
        Insert: {
          author?: string | null
          author_id?: string | null
          content?: Json
          content_format?: string
          cover_image?: string | null
          created_at?: string
          excerpt?: Json
          id?: string
          is_published?: boolean
          published_at?: string | null
          revision?: number
          slug: string
          tags?: string[] | null
          title?: Json
          updated_at?: string
        }
        Update: {
          author?: string | null
          author_id?: string | null
          content?: Json
          content_format?: string
          cover_image?: string | null
          created_at?: string
          excerpt?: Json
          id?: string
          is_published?: boolean
          published_at?: string | null
          revision?: number
          slug?: string
          tags?: string[] | null
          title?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_author_id_fkey"
            columns: ["author_id"]
            referencedRelation: "blog_authors"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      blog_tags: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          added_note: string | null
          cart_id: string
          created_at: string
          id: string
          note: string | null
          price_cents: number
          product_id: string
          quantity: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          added_note?: string | null
          cart_id: string
          created_at?: string
          id?: string
          note?: string | null
          price_cents: number
          product_id: string
          quantity?: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          added_note?: string | null
          cart_id?: string
          created_at?: string
          id?: string
          note?: string | null
          price_cents?: number
          product_id?: string
          quantity?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          converted_to_order_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          name: string | null
          session_id: string | null
          share_count: number | null
          share_created_by: string | null
          share_enabled: boolean
          share_expires_at: string | null
          share_message: string | null
          share_name: string | null
          share_token: string | null
          shared_by_user_id: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          converted_to_order_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          name?: string | null
          session_id?: string | null
          share_count?: number | null
          share_created_by?: string | null
          share_enabled?: boolean
          share_expires_at?: string | null
          share_message?: string | null
          share_name?: string | null
          share_token?: string | null
          shared_by_user_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          converted_to_order_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          name?: string | null
          session_id?: string | null
          share_count?: number | null
          share_created_by?: string | null
          share_enabled?: boolean
          share_expires_at?: string | null
          share_message?: string | null
          share_name?: string | null
          share_token?: string | null
          shared_by_user_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          cover_image_alt: string | null
          cover_image_bucket: string | null
          cover_image_path: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          position: number
          section: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          cover_image_alt?: string | null
          cover_image_bucket?: string | null
          cover_image_path?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          position?: number
          section?: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          cover_image_alt?: string | null
          cover_image_bucket?: string | null
          cover_image_path?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          position?: number
          section?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      categories_backup: {
        Row: {
          created_at: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          parent_id: string | null
          position: number | null
          slug: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          parent_id?: string | null
          position?: number | null
          slug?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          parent_id?: string | null
          position?: number | null
          slug?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      channel_participants: {
        Row: {
          channel_id: string
          last_read_at: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          channel_id: string
          last_read_at?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          channel_id?: string
          last_read_at?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_participants_channel_id_fkey"
            columns: ["channel_id"]
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_participants_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_participants_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_participants_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles_ready_for_purge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_participants_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles_with_auth"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          avatar_url: string | null
          created_at: string
          creator_id: string
          id: string
          name: string
          type_id: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          creator_id: string
          id?: string
          name: string
          type_id?: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          creator_id?: string
          id?: string
          name?: string
          type_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "channels_creator_id_fkey"
            columns: ["creator_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_creator_id_fkey"
            columns: ["creator_id"]
            referencedRelation: "profiles_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_creator_id_fkey"
            columns: ["creator_id"]
            referencedRelation: "profiles_ready_for_purge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_creator_id_fkey"
            columns: ["creator_id"]
            referencedRelation: "profiles_with_auth"
            referencedColumns: ["id"]
          },
        ]
      }
      cleanup_audit: {
        Row: {
          created_at: string | null
          details: Json | null
          id: string
          step: string | null
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          id?: string
          step?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          id?: string
          step?: string | null
        }
        Relationships: []
      }
      cleanup_logs: {
        Row: {
          cleanup_type: string
          created_at: string | null
          id: string
          records_cleaned: number | null
          summary: string | null
        }
        Insert: {
          cleanup_type: string
          created_at?: string | null
          id?: string
          records_cleaned?: number | null
          summary?: string | null
        }
        Update: {
          cleanup_type?: string
          created_at?: string | null
          id?: string
          records_cleaned?: number | null
          summary?: string | null
        }
        Relationships: []
      }
      coach_daily_reports_backup: {
        Row: {
          activity_type: string | null
          admin_profile_id: string | null
          calendar_event_id: string | null
          coach_profile_id: string | null
          created_at: string | null
          created_by: string | null
          hours_worked: number | null
          id: string | null
          initials: string | null
          location: string | null
          notes: string | null
          report_date: string | null
          work_location_id: string | null
        }
        Insert: {
          activity_type?: string | null
          admin_profile_id?: string | null
          calendar_event_id?: string | null
          coach_profile_id?: string | null
          created_at?: string | null
          created_by?: string | null
          hours_worked?: number | null
          id?: string | null
          initials?: string | null
          location?: string | null
          notes?: string | null
          report_date?: string | null
          work_location_id?: string | null
        }
        Update: {
          activity_type?: string | null
          admin_profile_id?: string | null
          calendar_event_id?: string | null
          coach_profile_id?: string | null
          created_at?: string | null
          created_by?: string | null
          hours_worked?: number | null
          id?: string | null
          initials?: string | null
          location?: string | null
          notes?: string | null
          report_date?: string | null
          work_location_id?: string | null
        }
        Relationships: []
      }
      collection_products: {
        Row: {
          collection_id: string
          position: number
          product_id: string
        }
        Insert: {
          collection_id: string
          position?: number
          product_id: string
        }
        Update: {
          collection_id?: string
          position?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_products_collection_id_fkey"
            columns: ["collection_id"]
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_products_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          cover_image_alt: string | null
          cover_image_bucket: string | null
          cover_image_path: string | null
          description: string | null
          id: string
          is_home_section: boolean
          name: string
          position: number
          slug: string
        }
        Insert: {
          cover_image_alt?: string | null
          cover_image_bucket?: string | null
          cover_image_path?: string | null
          description?: string | null
          id?: string
          is_home_section?: boolean
          name: string
          position?: number
          slug: string
        }
        Update: {
          cover_image_alt?: string | null
          cover_image_bucket?: string | null
          cover_image_path?: string | null
          description?: string | null
          id?: string
          is_home_section?: boolean
          name?: string
          position?: number
          slug?: string
        }
        Relationships: []
      }
      collections_backup: {
        Row: {
          description: string | null
          id: string | null
          is_home_section: boolean | null
          name: string | null
          position: number | null
          slug: string | null
        }
        Insert: {
          description?: string | null
          id?: string | null
          is_home_section?: boolean | null
          name?: string | null
          position?: number | null
          slug?: string | null
        }
        Update: {
          description?: string | null
          id?: string | null
          is_home_section?: boolean | null
          name?: string | null
          position?: number | null
          slug?: string | null
        }
        Relationships: []
      }
      creator_cashouts: {
        Row: {
          admin_notes: string | null
          amount_cents: number
          creator_id: string
          failure_reason: string | null
          id: string
          requested_at: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          admin_notes?: string | null
          amount_cents: number
          creator_id: string
          failure_reason?: string | null
          id?: string
          requested_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          admin_notes?: string | null
          amount_cents?: number
          creator_id?: string
          failure_reason?: string | null
          id?: string
          requested_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_cashouts_creator_id_fkey"
            columns: ["creator_id"]
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_cashouts_resolved_by_fkey"
            columns: ["resolved_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_cashouts_resolved_by_fkey"
            columns: ["resolved_by"]
            referencedRelation: "profiles_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_cashouts_resolved_by_fkey"
            columns: ["resolved_by"]
            referencedRelation: "profiles_ready_for_purge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_cashouts_resolved_by_fkey"
            columns: ["resolved_by"]
            referencedRelation: "profiles_with_auth"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_ledger_entries: {
        Row: {
          amount_cents: number
          created_at: string
          creator_id: string
          description: string | null
          discount_code: string | null
          id: string
          kind: string
          order_id: string | null
          order_number: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          creator_id: string
          description?: string | null
          discount_code?: string | null
          id?: string
          kind: string
          order_id?: string | null
          order_number?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          creator_id?: string
          description?: string | null
          discount_code?: string | null
          id?: string
          kind?: string
          order_id?: string | null
          order_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_ledger_entries_creator_id_fkey"
            columns: ["creator_id"]
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_ledger_entries_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "order_history_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_ledger_entries_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_tiers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          percent_off: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          percent_off: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          percent_off?: number
          sort_order?: number
        }
        Relationships: []
      }
      creators: {
        Row: {
          balance_cents: number
          cashout_threshold_cents: number
          created_at: string
          discount_id: string
          id: string
          lifetime_earned_cents: number
          lifetime_paid_cents: number
          notes: string | null
          profile_id: string
          status: string
          tier_id: string
          updated_at: string
        }
        Insert: {
          balance_cents?: number
          cashout_threshold_cents?: number
          created_at?: string
          discount_id: string
          id?: string
          lifetime_earned_cents?: number
          lifetime_paid_cents?: number
          notes?: string | null
          profile_id: string
          status?: string
          tier_id: string
          updated_at?: string
        }
        Update: {
          balance_cents?: number
          cashout_threshold_cents?: number
          created_at?: string
          discount_id?: string
          id?: string
          lifetime_earned_cents?: number
          lifetime_paid_cents?: number
          notes?: string | null
          profile_id?: string
          status?: string
          tier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creators_discount_id_fkey"
            columns: ["discount_id"]
            referencedRelation: "discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creators_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creators_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creators_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles_ready_for_purge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creators_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles_with_auth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creators_tier_id_fkey"
            columns: ["tier_id"]
            referencedRelation: "creator_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          auth_user_id: string | null
          claimed_at: string | null
          claimed_by_auth_id: string | null
          created_at: string
          display_name: string | null
          email: string | null
          first_name: string | null
          first_order_at: string | null
          guest_key: string | null
          id: string
          last_name: string | null
          last_order_at: string | null
          marketing_opt_in: boolean
          marketing_opt_in_at: string | null
          order_count: number
          phone: string | null
          total_spent_cents: number
          type: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          claimed_at?: string | null
          claimed_by_auth_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          first_order_at?: string | null
          guest_key?: string | null
          id?: string
          last_name?: string | null
          last_order_at?: string | null
          marketing_opt_in?: boolean
          marketing_opt_in_at?: string | null
          order_count?: number
          phone?: string | null
          total_spent_cents?: number
          type?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          claimed_at?: string | null
          claimed_by_auth_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          first_order_at?: string | null
          guest_key?: string | null
          id?: string
          last_name?: string | null
          last_order_at?: string | null
          marketing_opt_in?: boolean
          marketing_opt_in_at?: string | null
          order_count?: number
          phone?: string | null
          total_spent_cents?: number
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      dim_calendar: {
        Row: {
          calendar_date: string
          calendar_date_string: string
          calendar_day: number
          calendar_month: number
          calendar_quarter: number
          calendar_year: number
          created_at: string | null
          day_name: string
          day_of_quarter: number
          day_of_week: number
          day_of_week_in_month: number
          day_of_week_in_quarter: number
          day_of_week_in_year: number
          day_of_year: number
          days_in_month: number
          first_date_of_month: string
          first_date_of_quarter: string
          first_date_of_week: string
          first_date_of_year: string
          holiday_name: string | null
          holiday_season_name: string | null
          is_business_day: boolean
          is_holiday: boolean
          is_holiday_season: boolean
          is_leap_year: boolean
          is_weekday: boolean
          last_date_of_month: string
          last_date_of_quarter: string
          last_date_of_week: string
          last_date_of_year: string
          month_name: string
          next_business_day: string | null
          previous_business_day: string | null
          updated_at: string | null
          week_of_month: number
          week_of_quarter: number
          week_of_year: number
        }
        Insert: {
          calendar_date: string
          calendar_date_string: string
          calendar_day: number
          calendar_month: number
          calendar_quarter: number
          calendar_year: number
          created_at?: string | null
          day_name: string
          day_of_quarter: number
          day_of_week: number
          day_of_week_in_month: number
          day_of_week_in_quarter: number
          day_of_week_in_year: number
          day_of_year: number
          days_in_month: number
          first_date_of_month: string
          first_date_of_quarter: string
          first_date_of_week: string
          first_date_of_year: string
          holiday_name?: string | null
          holiday_season_name?: string | null
          is_business_day: boolean
          is_holiday?: boolean
          is_holiday_season?: boolean
          is_leap_year: boolean
          is_weekday: boolean
          last_date_of_month: string
          last_date_of_quarter: string
          last_date_of_week: string
          last_date_of_year: string
          month_name: string
          next_business_day?: string | null
          previous_business_day?: string | null
          updated_at?: string | null
          week_of_month: number
          week_of_quarter: number
          week_of_year: number
        }
        Update: {
          calendar_date?: string
          calendar_date_string?: string
          calendar_day?: number
          calendar_month?: number
          calendar_quarter?: number
          calendar_year?: number
          created_at?: string | null
          day_name?: string
          day_of_quarter?: number
          day_of_week?: number
          day_of_week_in_month?: number
          day_of_week_in_quarter?: number
          day_of_week_in_year?: number
          day_of_year?: number
          days_in_month?: number
          first_date_of_month?: string
          first_date_of_quarter?: string
          first_date_of_week?: string
          first_date_of_year?: string
          holiday_name?: string | null
          holiday_season_name?: string | null
          is_business_day?: boolean
          is_holiday?: boolean
          is_holiday_season?: boolean
          is_leap_year?: boolean
          is_weekday?: boolean
          last_date_of_month?: string
          last_date_of_quarter?: string
          last_date_of_week?: string
          last_date_of_year?: string
          month_name?: string
          next_business_day?: string | null
          previous_business_day?: string | null
          updated_at?: string | null
          week_of_month?: number
          week_of_quarter?: number
          week_of_year?: number
        }
        Relationships: []
      }
      discount_reservations: {
        Row: {
          confirmed_at: string | null
          customer_key: string | null
          discount_id: string
          expires_at: string
          held_at: string
          id: string
          released_at: string | null
          status: string
        }
        Insert: {
          confirmed_at?: string | null
          customer_key?: string | null
          discount_id: string
          expires_at: string
          held_at?: string
          id?: string
          released_at?: string | null
          status?: string
        }
        Update: {
          confirmed_at?: string | null
          customer_key?: string | null
          discount_id?: string
          expires_at?: string
          held_at?: string
          id?: string
          released_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_reservations_discount_id_fkey"
            columns: ["discount_id"]
            referencedRelation: "discounts"
            referencedColumns: ["id"]
          },
        ]
      }
      discounts: {
        Row: {
          amount_off_cents: number | null
          code: string
          created_at: string | null
          ends_at: string | null
          id: string
          is_active: boolean | null
          label: string | null
          max_uses: number | null
          percent_off: number | null
          starts_at: string | null
          type: string
          updated_at: string | null
          uses_count: number
        }
        Insert: {
          amount_off_cents?: number | null
          code: string
          created_at?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          max_uses?: number | null
          percent_off?: number | null
          starts_at?: string | null
          type: string
          updated_at?: string | null
          uses_count?: number
        }
        Update: {
          amount_off_cents?: number | null
          code?: string
          created_at?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          max_uses?: number | null
          percent_off?: number | null
          starts_at?: string | null
          type?: string
          updated_at?: string | null
          uses_count?: number
        }
        Relationships: []
      }
      dmr_endpoints: {
        Row: {
          api_key: string
          base_url: string
          created_at: string | null
          id: string
          is_active: boolean
          is_primary: boolean
          last_checked_at: string | null
          last_status: string | null
          model_count: number | null
          models: Json | null
          name: string
          updated_at: string | null
        }
        Insert: {
          api_key?: string
          base_url: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          last_checked_at?: string | null
          last_status?: string | null
          model_count?: number | null
          models?: Json | null
          name: string
          updated_at?: string | null
        }
        Update: {
          api_key?: string
          base_url?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          last_checked_at?: string | null
          last_status?: string | null
          model_count?: number | null
          models?: Json | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      document_activity: {
        Row: {
          activity_type: string
          created_at: string | null
          details: Json | null
          document_id: string
          id: string
          ip_address: unknown | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string | null
          details?: Json | null
          document_id: string
          id?: string
          ip_address?: unknown | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string | null
          details?: Json | null
          document_id?: string
          id?: string
          ip_address?: unknown | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_activity_document_id_fkey"
            columns: ["document_id"]
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_shares: {
        Row: {
          document_id: string
          expires_at: string | null
          id: string
          is_public_link: boolean | null
          permission_level: string | null
          share_token: string | null
          shared_at: string | null
          shared_by: string
          shared_with_role: string | null
          shared_with_user_id: string | null
        }
        Insert: {
          document_id: string
          expires_at?: string | null
          id?: string
          is_public_link?: boolean | null
          permission_level?: string | null
          share_token?: string | null
          shared_at?: string | null
          shared_by: string
          shared_with_role?: string | null
          shared_with_user_id?: string | null
        }
        Update: {
          document_id?: string
          expires_at?: string | null
          id?: string
          is_public_link?: boolean | null
          permission_level?: string | null
          share_token?: string | null
          shared_at?: string | null
          shared_by?: string
          shared_with_role?: string | null
          shared_with_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_shares_document_id_fkey"
            columns: ["document_id"]
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          bucket_name: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          is_favorite: boolean | null
          is_public: boolean | null
          is_public_folder: boolean | null
          is_shared: boolean | null
          mime_type: string | null
          name: string
          parent_path: string | null
          parent_version_id: string | null
          path: string
          public_slug: string | null
          public_url_slug: string | null
          search_vector: unknown | null
          size_bytes: number | null
          storage_path: string | null
          tags: string[] | null
          type: string
          updated_at: string | null
          uploaded_by: string | null
          version: number | null
          visibility: string | null
        }
        Insert: {
          bucket_name?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          is_favorite?: boolean | null
          is_public?: boolean | null
          is_public_folder?: boolean | null
          is_shared?: boolean | null
          mime_type?: string | null
          name: string
          parent_path?: string | null
          parent_version_id?: string | null
          path: string
          public_slug?: string | null
          public_url_slug?: string | null
          search_vector?: unknown | null
          size_bytes?: number | null
          storage_path?: string | null
          tags?: string[] | null
          type: string
          updated_at?: string | null
          uploaded_by?: string | null
          version?: number | null
          visibility?: string | null
        }
        Update: {
          bucket_name?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          is_favorite?: boolean | null
          is_public?: boolean | null
          is_public_folder?: boolean | null
          is_shared?: boolean | null
          mime_type?: string | null
          name?: string
          parent_path?: string | null
          parent_version_id?: string | null
          path?: string
          public_slug?: string | null
          public_url_slug?: string | null
          search_vector?: unknown | null
          size_bytes?: number | null
          storage_path?: string | null
          tags?: string[] | null
          type?: string
          updated_at?: string | null
          uploaded_by?: string | null
          version?: number | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_parent_version_id_fkey"
            columns: ["parent_version_id"]
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      environments: {
        Row: {
          active: boolean
          agent_last_seen_at: string | null
          agent_port: number
          agent_status: string
          agent_token_secret_id: string | null
          agent_url: string
          agent_version: string
          azure_app_id_secret_id: string | null
          azure_auth_key_secret_id: string | null
          azure_tenant_id_secret_id: string | null
          created_at: string
          ddns_hostname: string
          docker_url: string
          domain: string
          id: string
          is_default_target: boolean
          machine_role: string
          name: string
          npm_host: string
          npm_port: number
          npm_secret_id: string | null
          proxy_host: string
          proxy_port: number
          public_url: string
          sort_order: number
          status: Database["public"]["Enums"]["environment_status"]
          tags: string[]
          tls_config: Json
          type: Database["public"]["Enums"]["environment_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          agent_last_seen_at?: string | null
          agent_port?: number
          agent_status?: string
          agent_token_secret_id?: string | null
          agent_url?: string
          agent_version?: string
          azure_app_id_secret_id?: string | null
          azure_auth_key_secret_id?: string | null
          azure_tenant_id_secret_id?: string | null
          created_at?: string
          ddns_hostname?: string
          docker_url?: string
          domain?: string
          id?: string
          is_default_target?: boolean
          machine_role?: string
          name: string
          npm_host?: string
          npm_port?: number
          npm_secret_id?: string | null
          proxy_host?: string
          proxy_port?: number
          public_url?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["environment_status"]
          tags?: string[]
          tls_config?: Json
          type?: Database["public"]["Enums"]["environment_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          agent_last_seen_at?: string | null
          agent_port?: number
          agent_status?: string
          agent_token_secret_id?: string | null
          agent_url?: string
          agent_version?: string
          azure_app_id_secret_id?: string | null
          azure_auth_key_secret_id?: string | null
          azure_tenant_id_secret_id?: string | null
          created_at?: string
          ddns_hostname?: string
          docker_url?: string
          domain?: string
          id?: string
          is_default_target?: boolean
          machine_role?: string
          name?: string
          npm_host?: string
          npm_port?: number
          npm_secret_id?: string | null
          proxy_host?: string
          proxy_port?: number
          public_url?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["environment_status"]
          tags?: string[]
          tls_config?: Json
          type?: Database["public"]["Enums"]["environment_type"]
          updated_at?: string
        }
        Relationships: []
      }
      folder_favorites: {
        Row: {
          created_at: string | null
          folder_name: string
          folder_path: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          folder_name: string
          folder_path: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          folder_name?: string
          folder_path?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      fulfillment_items: {
        Row: {
          created_at: string
          fulfillment_id: string
          id: string
          order_item_id: string
          quantity: number
        }
        Insert: {
          created_at?: string
          fulfillment_id: string
          id?: string
          order_item_id: string
          quantity: number
        }
        Update: {
          created_at?: string
          fulfillment_id?: string
          id?: string
          order_item_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_items_fulfillment_id_fkey"
            columns: ["fulfillment_id"]
            referencedRelation: "fulfillments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_items_order_item_id_fkey"
            columns: ["order_item_id"]
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfillment_tracking: {
        Row: {
          carrier: string | null
          created_at: string
          fulfillment_id: string
          id: string
          tracking_number: string
          tracking_url: string | null
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          fulfillment_id: string
          id?: string
          tracking_number: string
          tracking_url?: string | null
        }
        Update: {
          carrier?: string | null
          created_at?: string
          fulfillment_id?: string
          id?: string
          tracking_number?: string
          tracking_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_tracking_fulfillment_id_fkey"
            columns: ["fulfillment_id"]
            referencedRelation: "fulfillments"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfillments: {
        Row: {
          created_at: string
          id: string
          note: string | null
          order_id: string
          ship_to_city: string | null
          ship_to_country: string | null
          ship_to_line1: string | null
          ship_to_line2: string | null
          ship_to_name: string | null
          ship_to_phone: string | null
          ship_to_postal_code: string | null
          ship_to_region: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          order_id: string
          ship_to_city?: string | null
          ship_to_country?: string | null
          ship_to_line1?: string | null
          ship_to_line2?: string | null
          ship_to_name?: string | null
          ship_to_phone?: string | null
          ship_to_postal_code?: string | null
          ship_to_region?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string
          ship_to_city?: string | null
          ship_to_country?: string | null
          ship_to_line1?: string | null
          ship_to_line2?: string | null
          ship_to_name?: string | null
          ship_to_phone?: string | null
          ship_to_postal_code?: string | null
          ship_to_region?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fulfillments_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "order_history_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillments_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      hero_slides: {
        Row: {
          alt_text: string | null
          blurhash: string | null
          bucket_name: string
          created_at: string
          headline_line1: string
          headline_line2: string | null
          height: number | null
          id: string
          is_active: boolean
          mobile_alt_text: string | null
          mobile_bucket_name: string
          mobile_height: number | null
          mobile_object_path: string | null
          mobile_width: number | null
          object_path: string
          overlay_opacity: number | null
          page: string
          pill_text: string | null
          position: number
          primary_button_href: string
          primary_button_label: string
          secondary_button_href: string | null
          secondary_button_label: string | null
          subtext: string | null
          target_device: string | null
          text_alignment: string
          text_color: string
          updated_at: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          blurhash?: string | null
          bucket_name?: string
          created_at?: string
          headline_line1: string
          headline_line2?: string | null
          height?: number | null
          id?: string
          is_active?: boolean
          mobile_alt_text?: string | null
          mobile_bucket_name?: string
          mobile_height?: number | null
          mobile_object_path?: string | null
          mobile_width?: number | null
          object_path: string
          overlay_opacity?: number | null
          page?: string
          pill_text?: string | null
          position?: number
          primary_button_href?: string
          primary_button_label?: string
          secondary_button_href?: string | null
          secondary_button_label?: string | null
          subtext?: string | null
          target_device?: string | null
          text_alignment?: string
          text_color?: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          blurhash?: string | null
          bucket_name?: string
          created_at?: string
          headline_line1?: string
          headline_line2?: string | null
          height?: number | null
          id?: string
          is_active?: boolean
          mobile_alt_text?: string | null
          mobile_bucket_name?: string
          mobile_height?: number | null
          mobile_object_path?: string | null
          mobile_width?: number | null
          object_path?: string
          overlay_opacity?: number | null
          page?: string
          pill_text?: string | null
          position?: number
          primary_button_href?: string
          primary_button_label?: string
          secondary_button_href?: string | null
          secondary_button_label?: string | null
          subtext?: string | null
          target_device?: string | null
          text_alignment?: string
          text_color?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: []
      }
      homepage_content: {
        Row: {
          id: string
          json: Json
          key: string
          updated_at: string
        }
        Insert: {
          id?: string
          json: Json
          key: string
          updated_at?: string
        }
        Update: {
          id?: string
          json?: Json
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          allow_backorder: boolean
          id: string
          quantity: number
          track_inventory: boolean
          updated_at: string
          variant_id: string
        }
        Insert: {
          allow_backorder?: boolean
          id?: string
          quantity?: number
          track_inventory?: boolean
          updated_at?: string
          variant_id: string
        }
        Update: {
          allow_backorder?: boolean
          id?: string
          quantity?: number
          track_inventory?: boolean
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_variant_id_fkey"
            columns: ["variant_id"]
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          delta_qty: number
          id: string
          note: string | null
          reason: string
          reference_id: string | null
          reference_type: string | null
          variant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta_qty: number
          id?: string
          note?: string | null
          reason: string
          reference_id?: string | null
          reference_type?: string | null
          variant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta_qty?: number
          id?: string
          note?: string | null
          reason?: string
          reference_id?: string | null
          reference_type?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          code: string
          created_at: string | null
          expires_at: string | null
          inviter_id: string | null
          max_uses: number
          role_id: string | null
        }
        Insert: {
          code?: string
          created_at?: string | null
          expires_at?: string | null
          inviter_id?: string | null
          max_uses?: number
          role_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          expires_at?: string | null
          inviter_id?: string | null
          max_uses?: number
          role_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_inviter_id_fkey"
            columns: ["inviter_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_inviter_id_fkey"
            columns: ["inviter_id"]
            referencedRelation: "profiles_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_inviter_id_fkey"
            columns: ["inviter_id"]
            referencedRelation: "profiles_ready_for_purge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_inviter_id_fkey"
            columns: ["inviter_id"]
            referencedRelation: "profiles_with_auth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_role_id_fkey"
            columns: ["role_id"]
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_nav_items: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean
          open_in_new_tab: boolean
          path: string | null
          position: number
          submenu_type: string | null
          translations: Json
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          open_in_new_tab?: boolean
          path?: string | null
          position?: number
          submenu_type?: string | null
          translations?: Json
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          open_in_new_tab?: boolean
          path?: string | null
          position?: number
          submenu_type?: string | null
          translations?: Json
        }
        Relationships: []
      }
      landing_sections: {
        Row: {
          config: Json | null
          created_at: string
          id: string
          is_active: boolean
          page: string
          position: number
          type: string
          updated_at: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean
          page?: string
          position: number
          type: string
          updated_at?: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean
          page?: string
          position?: number
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      mail_failures: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          order_id: string | null
          reason: string
          subject: string
          to_email: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          order_id?: string | null
          reason: string
          subject: string
          to_email: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          order_id?: string | null
          reason?: string
          subject?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "mail_failures_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "order_history_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_failures_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      managed_environments: {
        Row: {
          agent_last_seen_at: string | null
          agent_status: string | null
          agent_url: string | null
          agent_version: string | null
          created_at: string
          env_id: string
          id: string
          last_synced_at: string | null
          metadata: Json
          name: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          agent_last_seen_at?: string | null
          agent_status?: string | null
          agent_url?: string | null
          agent_version?: string | null
          created_at?: string
          env_id: string
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          name?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          agent_last_seen_at?: string | null
          agent_status?: string | null
          agent_url?: string | null
          agent_version?: string | null
          created_at?: string
          env_id?: string
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          name?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      managed_stacks: {
        Row: {
          compose_path: string
          created_at: string
          entrypoint: string
          env_vars: Json
          environment_id: string
          git_config: Json | null
          id: string
          source: string
          stack_name: string
          status: string
          updated_at: string
          zone_id: string
        }
        Insert: {
          compose_path?: string
          created_at?: string
          entrypoint?: string
          env_vars?: Json
          environment_id: string
          git_config?: Json | null
          id?: string
          source?: string
          stack_name: string
          status?: string
          updated_at?: string
          zone_id: string
        }
        Update: {
          compose_path?: string
          created_at?: string
          entrypoint?: string
          env_vars?: Json
          environment_id?: string
          git_config?: Json | null
          id?: string
          source?: string
          stack_name?: string
          status?: string
          updated_at?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "managed_stacks_environment_id_fkey"
            columns: ["environment_id"]
            referencedRelation: "environments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managed_stacks_zone_id_fkey"
            columns: ["zone_id"]
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id: string
          message_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id?: string
          message_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          message_id: string
          reaction: string
          user_id: string
        }
        Insert: {
          created_at?: string
          message_id: string
          reaction: string
          user_id: string
        }
        Update: {
          created_at?: string
          message_id?: string
          reaction?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles_ready_for_purge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles_with_auth"
            referencedColumns: ["id"]
          },
        ]
      }
      message_read_status: {
        Row: {
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_read_status_message_id_fkey"
            columns: ["message_id"]
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_read_status_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_read_status_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_read_status_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles_ready_for_purge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_read_status_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles_with_auth"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          channel_id: string
          content: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          channel_id: string
          content: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          channel_id?: string
          content?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_channel_id_fkey"
            columns: ["channel_id"]
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            referencedRelation: "profiles_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            referencedRelation: "profiles_ready_for_purge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            referencedRelation: "profiles_with_auth"
            referencedColumns: ["id"]
          },
        ]
      }
      nav_items: {
        Row: {
          id: number
          label: string
          page_slug: string
          parent_id: number | null
          sort_order: number
        }
        Insert: {
          id?: number
          label: string
          page_slug: string
          parent_id?: number | null
          sort_order: number
        }
        Update: {
          id?: number
          label?: string
          page_slug?: string
          parent_id?: number | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "nav_items_page_slug_fkey"
            columns: ["page_slug"]
            referencedRelation: "pages"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "nav_items_parent_id_fkey"
            columns: ["parent_id"]
            referencedRelation: "nav_items"
            referencedColumns: ["id"]
          },
        ]
      }
      network_devices: {
        Row: {
          created_at: string | null
          hostname: string
          id: string
          ip: string | null
          is_online: boolean | null
          label: string | null
          last_seen: string | null
          notes: string | null
          os: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          hostname: string
          id?: string
          ip?: string | null
          is_online?: boolean | null
          label?: string | null
          last_seen?: string | null
          notes?: string | null
          os?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          hostname?: string
          id?: string
          ip?: string | null
          is_online?: boolean | null
          label?: string | null
          last_seen?: string | null
          notes?: string | null
          os?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          source: string | null
          status: string
          theme_id: string | null
          unsubscribe_token: string
          unsubscribed_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          source?: string | null
          status?: string
          theme_id?: string | null
          unsubscribe_token?: string
          unsubscribed_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          source?: string | null
          status?: string
          theme_id?: string | null
          unsubscribe_token?: string
          unsubscribed_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          content: string | null
          created_at: string | null
          id: string
          image_url: string | null
          is_read: boolean
          metadata: Json
          receiver_id: string | null
          role_admin: boolean | null
          role_client: boolean | null
          role_jobcoach: boolean | null
          role_user: boolean | null
          sender_id: string | null
          title: string
          type: string
        }
        Insert: {
          action_url?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_read?: boolean
          metadata?: Json
          receiver_id?: string | null
          role_admin?: boolean | null
          role_client?: boolean | null
          role_jobcoach?: boolean | null
          role_user?: boolean | null
          sender_id?: string | null
          title: string
          type?: string
        }
        Update: {
          action_url?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_read?: boolean
          metadata?: Json
          receiver_id?: string | null
          role_admin?: boolean | null
          role_client?: boolean | null
          role_jobcoach?: boolean | null
          role_user?: boolean | null
          sender_id?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      notifications_image_backup_20260613: {
        Row: {
          backed_up_at: string | null
          id: string | null
          image_url: string | null
        }
        Insert: {
          backed_up_at?: string | null
          id?: string | null
          image_url?: string | null
        }
        Update: {
          backed_up_at?: string | null
          id?: string | null
          image_url?: string | null
        }
        Relationships: []
      }
      order_addresses: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          full_name: string | null
          id: string
          line1: string | null
          line2: string | null
          order_id: string
          phone: string | null
          postal_code: string | null
          region: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          line1?: string | null
          line2?: string | null
          order_id: string
          phone?: string | null
          postal_code?: string | null
          region?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          line1?: string | null
          line2?: string | null
          order_id?: string
          phone?: string | null
          postal_code?: string | null
          region?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_addresses_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "order_history_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_addresses_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          compare_at_price_cents: number | null
          created_at: string
          currency: string
          id: string
          order_id: string
          price_cents: number
          product_id: string | null
          product_snapshot: Json | null
          product_title: string
          quantity: number
          research_product_id: string | null
          research_variant_id: string | null
          sku: string | null
          title: string | null
          variant_id: string | null
          variant_title: string
        }
        Insert: {
          compare_at_price_cents?: number | null
          created_at?: string
          currency?: string
          id?: string
          order_id: string
          price_cents: number
          product_id?: string | null
          product_snapshot?: Json | null
          product_title: string
          quantity: number
          research_product_id?: string | null
          research_variant_id?: string | null
          sku?: string | null
          title?: string | null
          variant_id?: string | null
          variant_title?: string
        }
        Update: {
          compare_at_price_cents?: number | null
          created_at?: string
          currency?: string
          id?: string
          order_id?: string
          price_cents?: number
          product_id?: string | null
          product_snapshot?: Json | null
          product_title?: string
          quantity?: number
          research_product_id?: string | null
          research_variant_id?: string | null
          sku?: string | null
          title?: string | null
          variant_id?: string | null
          variant_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "order_history_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_research_product_id_fkey"
            columns: ["research_product_id"]
            referencedRelation: "research_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_research_variant_id_fkey"
            columns: ["research_variant_id"]
            referencedRelation: "research_product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          order_id: string
          provider: string
          provider_ref: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          id?: string
          order_id: string
          provider: string
          provider_ref?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          order_id?: string
          provider?: string
          provider_ref?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "order_history_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          auth_user_id: string | null
          billing_address: Json | null
          billing_details: Json | null
          cart_id: string | null
          checkout_expires_at: string | null
          checkout_step: string | null
          created_at: string
          currency: string
          customer_email: string | null
          customer_first_name: string | null
          customer_id: string | null
          customer_ip: unknown | null
          customer_last_name: string | null
          customer_notes: string | null
          customer_user_agent: string | null
          delivered_at: string | null
          discount_cents: number
          discount_reservation_id: string | null
          email: string | null
          guest_email: string | null
          guest_key: string | null
          id: string
          internal_notes: string | null
          label_pdf_path: string | null
          label_postage_cents: number | null
          order_number: string
          order_source: string
          payment_attempted_at: string | null
          payment_error_code: string | null
          payment_error_message: string | null
          payment_failed_at: string | null
          payment_method_brand: string | null
          payment_method_exp_month: number | null
          payment_method_exp_year: number | null
          payment_method_id: string | null
          payment_method_last4: string | null
          payment_method_types: string[] | null
          payment_status: string | null
          payment_succeeded_at: string | null
          phone: string | null
          pos_staff_profile_id: string | null
          profile_id: string | null
          promo_code: string | null
          requires_action: boolean | null
          restocked_at: string | null
          shipped_at: string | null
          shipped_email_sent_at: string | null
          shipping_address: Json | null
          shipping_cents: number
          shipping_method_name: string | null
          shipping_options: Json[] | null
          shipping_provider_hint: string | null
          shipping_rate: Json | null
          shipping_rate_id: string | null
          shipping_service_code: string | null
          source: string
          status: string
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          stripe_client_secret: string | null
          stripe_payment_intent_id: string | null
          stripe_risk_level: string | null
          stripe_risk_score: number | null
          subtotal_cents: number
          tax_breakdown: Json | null
          tax_cents: number
          tax_rate: number | null
          theme_id: string | null
          total_cents: number
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          auth_user_id?: string | null
          billing_address?: Json | null
          billing_details?: Json | null
          cart_id?: string | null
          checkout_expires_at?: string | null
          checkout_step?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_first_name?: string | null
          customer_id?: string | null
          customer_ip?: unknown | null
          customer_last_name?: string | null
          customer_notes?: string | null
          customer_user_agent?: string | null
          delivered_at?: string | null
          discount_cents?: number
          discount_reservation_id?: string | null
          email?: string | null
          guest_email?: string | null
          guest_key?: string | null
          id?: string
          internal_notes?: string | null
          label_pdf_path?: string | null
          label_postage_cents?: number | null
          order_number?: string
          order_source?: string
          payment_attempted_at?: string | null
          payment_error_code?: string | null
          payment_error_message?: string | null
          payment_failed_at?: string | null
          payment_method_brand?: string | null
          payment_method_exp_month?: number | null
          payment_method_exp_year?: number | null
          payment_method_id?: string | null
          payment_method_last4?: string | null
          payment_method_types?: string[] | null
          payment_status?: string | null
          payment_succeeded_at?: string | null
          phone?: string | null
          pos_staff_profile_id?: string | null
          profile_id?: string | null
          promo_code?: string | null
          requires_action?: boolean | null
          restocked_at?: string | null
          shipped_at?: string | null
          shipped_email_sent_at?: string | null
          shipping_address?: Json | null
          shipping_cents?: number
          shipping_method_name?: string | null
          shipping_options?: Json[] | null
          shipping_provider_hint?: string | null
          shipping_rate?: Json | null
          shipping_rate_id?: string | null
          shipping_service_code?: string | null
          source?: string
          status?: string
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_client_secret?: string | null
          stripe_payment_intent_id?: string | null
          stripe_risk_level?: string | null
          stripe_risk_score?: number | null
          subtotal_cents?: number
          tax_breakdown?: Json | null
          tax_cents?: number
          tax_rate?: number | null
          theme_id?: string | null
          total_cents?: number
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          auth_user_id?: string | null
          billing_address?: Json | null
          billing_details?: Json | null
          cart_id?: string | null
          checkout_expires_at?: string | null
          checkout_step?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_first_name?: string | null
          customer_id?: string | null
          customer_ip?: unknown | null
          customer_last_name?: string | null
          customer_notes?: string | null
          customer_user_agent?: string | null
          delivered_at?: string | null
          discount_cents?: number
          discount_reservation_id?: string | null
          email?: string | null
          guest_email?: string | null
          guest_key?: string | null
          id?: string
          internal_notes?: string | null
          label_pdf_path?: string | null
          label_postage_cents?: number | null
          order_number?: string
          order_source?: string
          payment_attempted_at?: string | null
          payment_error_code?: string | null
          payment_error_message?: string | null
          payment_failed_at?: string | null
          payment_method_brand?: string | null
          payment_method_exp_month?: number | null
          payment_method_exp_year?: number | null
          payment_method_id?: string | null
          payment_method_last4?: string | null
          payment_method_types?: string[] | null
          payment_status?: string | null
          payment_succeeded_at?: string | null
          phone?: string | null
          pos_staff_profile_id?: string | null
          profile_id?: string | null
          promo_code?: string | null
          requires_action?: boolean | null
          restocked_at?: string | null
          shipped_at?: string | null
          shipped_email_sent_at?: string | null
          shipping_address?: Json | null
          shipping_cents?: number
          shipping_method_name?: string | null
          shipping_options?: Json[] | null
          shipping_provider_hint?: string | null
          shipping_rate?: Json | null
          shipping_rate_id?: string | null
          shipping_service_code?: string | null
          source?: string
          status?: string
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_client_secret?: string | null
          stripe_payment_intent_id?: string | null
          stripe_risk_level?: string | null
          stripe_risk_score?: number | null
          subtotal_cents?: number
          tax_breakdown?: Json | null
          tax_cents?: number
          tax_rate?: number | null
          theme_id?: string | null
          total_cents?: number
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_cart_id_fkey"
            columns: ["cart_id"]
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_discount_reservation_id_fkey"
            columns: ["discount_reservation_id"]
            referencedRelation: "discount_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_pos_staff_profile_id_fkey"
            columns: ["pos_staff_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_pos_staff_profile_id_fkey"
            columns: ["pos_staff_profile_id"]
            referencedRelation: "profiles_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_pos_staff_profile_id_fkey"
            columns: ["pos_staff_profile_id"]
            referencedRelation: "profiles_ready_for_purge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_pos_staff_profile_id_fkey"
            columns: ["pos_staff_profile_id"]
            referencedRelation: "profiles_with_auth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles_ready_for_purge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles_with_auth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shipping_rate_id_fkey"
            columns: ["shipping_rate_id"]
            referencedRelation: "shipping_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      package_presets: {
        Row: {
          created_at: string
          height_in: number | null
          id: string
          is_active: boolean
          is_default: boolean
          length_in: number | null
          name: string
          position: number
          updated_at: string
          weight_oz: number | null
          width_in: number | null
        }
        Insert: {
          created_at?: string
          height_in?: number | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          length_in?: number | null
          name: string
          position?: number
          updated_at?: string
          weight_oz?: number | null
          width_in?: number | null
        }
        Update: {
          created_at?: string
          height_in?: number | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          length_in?: number | null
          name?: string
          position?: number
          updated_at?: string
          weight_oz?: number | null
          width_in?: number | null
        }
        Relationships: []
      }
      page_blocks: {
        Row: {
          alt_text: string | null
          block_type: string
          content: string | null
          id: number
          image_src: string | null
          page_slug: string
          props_json: Json | null
          sort_order: number
        }
        Insert: {
          alt_text?: string | null
          block_type: string
          content?: string | null
          id?: number
          image_src?: string | null
          page_slug: string
          props_json?: Json | null
          sort_order: number
        }
        Update: {
          alt_text?: string | null
          block_type?: string
          content?: string | null
          id?: number
          image_src?: string | null
          page_slug?: string
          props_json?: Json | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "page_blocks_page_slug_fkey"
            columns: ["page_slug"]
            referencedRelation: "pages"
            referencedColumns: ["slug"]
          },
        ]
      }
      page_widgets: {
        Row: {
          id: number
          page_slug: string
          sort_order: number
          widget_config: Json
          widget_type: string
        }
        Insert: {
          id?: number
          page_slug: string
          sort_order: number
          widget_config: Json
          widget_type: string
        }
        Update: {
          id?: number
          page_slug?: string
          sort_order?: number
          widget_config?: Json
          widget_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_widgets_page_slug_fkey"
            columns: ["page_slug"]
            referencedRelation: "pages"
            referencedColumns: ["slug"]
          },
        ]
      }
      pages: {
        Row: {
          anchor_id: string | null
          back_label: string | null
          parent_slug: string | null
          slug: string
          template: string
          title: string
        }
        Insert: {
          anchor_id?: string | null
          back_label?: string | null
          parent_slug?: string | null
          slug: string
          template?: string
          title: string
        }
        Update: {
          anchor_id?: string | null
          back_label?: string | null
          parent_slug?: string | null
          slug?: string
          template?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "pages_parent_slug_fkey"
            columns: ["parent_slug"]
            referencedRelation: "pages"
            referencedColumns: ["slug"]
          },
        ]
      }
      product_categories: {
        Row: {
          category_id: string
          product_id: string
        }
        Insert: {
          category_id: string
          product_id: string
        }
        Update: {
          category_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_category_id_fkey"
            columns: ["category_id"]
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories_backup: {
        Row: {
          category_id: string | null
          product_id: string | null
        }
        Insert: {
          category_id?: string | null
          product_id?: string | null
        }
        Update: {
          category_id?: string | null
          product_id?: string | null
        }
        Relationships: []
      }
      product_collections: {
        Row: {
          collection_id: string
          created_at: string
          product_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          product_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_collections_collection_id_fkey"
            columns: ["collection_id"]
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_collections_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_collections_backup: {
        Row: {
          collection_id: string | null
          created_at: string | null
          product_id: string | null
        }
        Insert: {
          collection_id?: string | null
          created_at?: string | null
          product_id?: string | null
        }
        Update: {
          collection_id?: string | null
          created_at?: string | null
          product_id?: string | null
        }
        Relationships: []
      }
      product_images: {
        Row: {
          alt_text: string | null
          blurhash: string | null
          bucket_name: string
          created_at: string
          height: number | null
          id: string
          is_primary: boolean
          is_public: boolean
          mime_type: string | null
          object_path: string
          position: number | null
          product_id: string
          size_bytes: number | null
          sort_order: number
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          blurhash?: string | null
          bucket_name?: string
          created_at?: string
          height?: number | null
          id?: string
          is_primary?: boolean
          is_public?: boolean
          mime_type?: string | null
          object_path: string
          position?: number | null
          product_id: string
          size_bytes?: number | null
          sort_order?: number
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          blurhash?: string | null
          bucket_name?: string
          created_at?: string
          height?: number | null
          id?: string
          is_primary?: boolean
          is_public?: boolean
          mime_type?: string | null
          object_path?: string
          position?: number | null
          product_id?: string
          size_bytes?: number | null
          sort_order?: number
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_review_stats: {
        Row: {
          avg_rating: number
          product_id: string
          review_count: number
          updated_at: string
        }
        Insert: {
          avg_rating?: number
          product_id: string
          review_count?: number
          updated_at?: string
        }
        Update: {
          avg_rating?: number
          product_id?: string
          review_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_review_stats_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          auth_user_id: string | null
          body: string | null
          created_at: string
          id: string
          is_verified_purchase: boolean
          order_id: string | null
          order_item_id: string | null
          product_id: string
          profile_id: string
          rating: number
          status: string
          title: string | null
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          auth_user_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          is_verified_purchase?: boolean
          order_id?: string | null
          order_item_id?: string | null
          product_id: string
          profile_id: string
          rating: number
          status?: string
          title?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          auth_user_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          is_verified_purchase?: boolean
          order_id?: string | null
          order_item_id?: string | null
          product_id?: string
          profile_id?: string
          rating?: number
          status?: string
          title?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "order_history_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles_ready_for_purge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles_with_auth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_variant_id_fkey"
            columns: ["variant_id"]
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tags: {
        Row: {
          product_id: string
          tag_id: string
        }
        Insert: {
          product_id: string
          tag_id: string
        }
        Update: {
          product_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tags_tag_id_fkey"
            columns: ["tag_id"]
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          allow_backorder: boolean
          compare_at_cents: number | null
          compare_at_price_cents: number | null
          created_at: string
          currency: string
          id: string
          inventory_qty: number
          is_active: boolean
          option_values: Json
          options: Json
          options_text: string | null
          position: number | null
          price_cents: number
          product_id: string
          sku: string
          title: string
          track_inventory: boolean
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          allow_backorder?: boolean
          compare_at_cents?: number | null
          compare_at_price_cents?: number | null
          created_at?: string
          currency?: string
          id?: string
          inventory_qty?: number
          is_active?: boolean
          option_values?: Json
          options?: Json
          options_text?: string | null
          position?: number | null
          price_cents: number
          product_id: string
          sku?: string
          title?: string
          track_inventory?: boolean
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          allow_backorder?: boolean
          compare_at_cents?: number | null
          compare_at_price_cents?: number | null
          created_at?: string
          currency?: string
          id?: string
          inventory_qty?: number
          is_active?: boolean
          option_values?: Json
          options?: Json
          options_text?: string | null
          position?: number | null
          price_cents?: number
          product_id?: string
          sku?: string
          title?: string
          track_inventory?: boolean
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          badge: string | null
          brand: string | null
          compare_at_price_cents: number | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          featured: boolean
          id: string
          is_featured: boolean | null
          made_in: string | null
          material: string | null
          price_cents: number | null
          search_text: string | null
          slug: string
          status: string
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          badge?: string | null
          brand?: string | null
          compare_at_price_cents?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          featured?: boolean
          id?: string
          is_featured?: boolean | null
          made_in?: string | null
          material?: string | null
          price_cents?: number | null
          search_text?: string | null
          slug: string
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          badge?: string | null
          brand?: string | null
          compare_at_price_cents?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          featured?: boolean
          id?: string
          is_featured?: boolean | null
          made_in?: string | null
          material?: string | null
          price_cents?: number | null
          search_text?: string | null
          slug?: string
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          created_at: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_by_auth_user_id: string | null
          display_name: string | null
          email: string | null
          first_name: string | null
          id: string
          initials: string | null
          is_active: boolean
          last_name: string | null
          last_seen_at: string | null
          region: string | null
          role: string | null
          terms_accepted_at: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_auth_user_id?: string | null
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          id: string
          initials?: string | null
          is_active?: boolean
          last_name?: string | null
          last_seen_at?: string | null
          region?: string | null
          role?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_auth_user_id?: string | null
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          initials?: string | null
          is_active?: boolean
          last_name?: string | null
          last_seen_at?: string | null
          region?: string | null
          role?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles_avatar_backup_20260613: {
        Row: {
          avatar_url: string | null
          backed_up_at: string | null
          id: string | null
        }
        Insert: {
          avatar_url?: string | null
          backed_up_at?: string | null
          id?: string | null
        }
        Update: {
          avatar_url?: string | null
          backed_up_at?: string | null
          id?: string | null
        }
        Relationships: []
      }
      promo_code_usage: {
        Row: {
          created_at: string
          discount_applied_cents: number
          id: string
          order_id: string
          promo_code_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          discount_applied_cents: number
          id?: string
          order_id: string
          promo_code_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          discount_applied_cents?: number
          id?: string
          order_id?: string
          promo_code_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_code_usage_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "order_history_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_usage_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_usage_promo_code_id_fkey"
            columns: ["promo_code_id"]
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          applicable_categories: string[] | null
          applicable_products: string[] | null
          code: string
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean | null
          max_discount_cents: number | null
          min_order_cents: number | null
          per_customer_limit: number | null
          updated_at: string
          usage_count: number | null
          usage_limit: number | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          applicable_categories?: string[] | null
          applicable_products?: string[] | null
          code: string
          created_at?: string
          description?: string | null
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean | null
          max_discount_cents?: number | null
          min_order_cents?: number | null
          per_customer_limit?: number | null
          updated_at?: string
          usage_count?: number | null
          usage_limit?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          applicable_categories?: string[] | null
          applicable_products?: string[] | null
          code?: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean | null
          max_discount_cents?: number | null
          min_order_cents?: number | null
          per_customer_limit?: number | null
          updated_at?: string
          usage_count?: number | null
          usage_limit?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      public_folders: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          folder_name: string
          folder_path: string
          id: string
          updated_at: string | null
          url_slug: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          folder_name: string
          folder_path: string
          id?: string
          updated_at?: string | null
          url_slug?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          folder_name?: string
          folder_path?: string
          id?: string
          updated_at?: string | null
          url_slug?: string | null
        }
        Relationships: []
      }
      recurring_event_patterns: {
        Row: {
          created_at: string | null
          day_of_month: number | null
          days_of_week: number[] | null
          end_date: string | null
          id: string
          interval_value: number
          max_occurrences: number | null
          pattern_type: string
          week_of_month: number | null
        }
        Insert: {
          created_at?: string | null
          day_of_month?: number | null
          days_of_week?: number[] | null
          end_date?: string | null
          id?: string
          interval_value?: number
          max_occurrences?: number | null
          pattern_type: string
          week_of_month?: number | null
        }
        Update: {
          created_at?: string | null
          day_of_month?: number | null
          days_of_week?: number[] | null
          end_date?: string | null
          id?: string
          interval_value?: number
          max_occurrences?: number | null
          pattern_type?: string
          week_of_month?: number | null
        }
        Relationships: []
      }
      research_cart_items: {
        Row: {
          cart_id: string
          created_at: string
          dosage_label: string | null
          id: string
          image_url: string | null
          price_cents: number
          product_title: string
          quantity: number
          research_product_id: string
          research_variant_id: string | null
          updated_at: string
          variant_title: string | null
        }
        Insert: {
          cart_id: string
          created_at?: string
          dosage_label?: string | null
          id?: string
          image_url?: string | null
          price_cents: number
          product_title: string
          quantity?: number
          research_product_id: string
          research_variant_id?: string | null
          updated_at?: string
          variant_title?: string | null
        }
        Update: {
          cart_id?: string
          created_at?: string
          dosage_label?: string | null
          id?: string
          image_url?: string | null
          price_cents?: number
          product_title?: string
          quantity?: number
          research_product_id?: string
          research_variant_id?: string | null
          updated_at?: string
          variant_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_cart_items_cart_id_fkey"
            columns: ["cart_id"]
            referencedRelation: "research_carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_cart_items_research_product_id_fkey"
            columns: ["research_product_id"]
            referencedRelation: "research_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_cart_items_research_variant_id_fkey"
            columns: ["research_variant_id"]
            referencedRelation: "research_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      research_carts: {
        Row: {
          converted_to_order_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          converted_to_order_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          converted_to_order_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_carts_converted_to_order_id_fkey"
            columns: ["converted_to_order_id"]
            referencedRelation: "order_history_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_carts_converted_to_order_id_fkey"
            columns: ["converted_to_order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      research_categories: {
        Row: {
          cover_image_alt: string | null
          cover_image_bucket: string | null
          cover_image_path: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          position: number | null
          section: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          cover_image_alt?: string | null
          cover_image_bucket?: string | null
          cover_image_path?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          position?: number | null
          section?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          cover_image_alt?: string | null
          cover_image_bucket?: string | null
          cover_image_path?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          position?: number | null
          section?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_categories_parent_id_fkey"
            columns: ["parent_id"]
            referencedRelation: "research_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      research_inventory: {
        Row: {
          allow_backorder: boolean
          id: string
          quantity: number
          track_inventory: boolean
          updated_at: string
          variant_id: string
        }
        Insert: {
          allow_backorder?: boolean
          id?: string
          quantity?: number
          track_inventory?: boolean
          updated_at?: string
          variant_id: string
        }
        Update: {
          allow_backorder?: boolean
          id?: string
          quantity?: number
          track_inventory?: boolean
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_inventory_variant_id_fkey"
            columns: ["variant_id"]
            referencedRelation: "research_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      research_inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          delta_qty: number
          id: string
          note: string | null
          reason: string
          reference_id: string | null
          reference_type: string | null
          variant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta_qty: number
          id?: string
          note?: string | null
          reason: string
          reference_id?: string | null
          reference_type?: string | null
          variant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta_qty?: number
          id?: string
          note?: string | null
          reason?: string
          reference_id?: string | null
          reference_type?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            referencedRelation: "research_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      research_lab_report_conformity_samples: {
        Row: {
          created_at: string
          id: string
          identification: string | null
          is_representative: boolean
          lab_report_id: string
          net_content_mg: number | null
          position: number
          purity_pct: number | null
          result: string | null
          sample_label: string
        }
        Insert: {
          created_at?: string
          id?: string
          identification?: string | null
          is_representative?: boolean
          lab_report_id: string
          net_content_mg?: number | null
          position?: number
          purity_pct?: number | null
          result?: string | null
          sample_label: string
        }
        Update: {
          created_at?: string
          id?: string
          identification?: string | null
          is_representative?: boolean
          lab_report_id?: string
          net_content_mg?: number | null
          position?: number
          purity_pct?: number | null
          result?: string | null
          sample_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_lab_report_conformity_samples_lab_report_id_fkey"
            columns: ["lab_report_id"]
            referencedRelation: "research_lab_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      research_lab_report_results: {
        Row: {
          analyte: string
          created_at: string
          id: string
          lab_report_id: string
          limit_spec: string | null
          position: number
          result: string | null
          section: string
          status: string | null
          unit: string | null
        }
        Insert: {
          analyte: string
          created_at?: string
          id?: string
          lab_report_id: string
          limit_spec?: string | null
          position?: number
          result?: string | null
          section: string
          status?: string | null
          unit?: string | null
        }
        Update: {
          analyte?: string
          created_at?: string
          id?: string
          lab_report_id?: string
          limit_spec?: string | null
          position?: number
          result?: string | null
          section?: string
          status?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_lab_report_results_lab_report_id_fkey"
            columns: ["lab_report_id"]
            referencedRelation: "research_lab_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      research_lab_report_stats: {
        Row: {
          created_at: string
          id: string
          lab_report_id: string
          mean_value: number | null
          metric_name: string
          position: number
          std_dev: number | null
          unit: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lab_report_id: string
          mean_value?: number | null
          metric_name: string
          position?: number
          std_dev?: number | null
          unit?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lab_report_id?: string
          mean_value?: number | null
          metric_name?: string
          position?: number
          std_dev?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_lab_report_stats_lab_report_id_fkey"
            columns: ["lab_report_id"]
            referencedRelation: "research_lab_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      research_lab_reports: {
        Row: {
          access_code: string | null
          appearance: string | null
          chromatogram_data: Json | null
          chromatogram_sample_ref: string | null
          chromatogram_x_label: string | null
          chromatogram_y_label: string | null
          coa_number: string | null
          created_at: string
          date_confirmed: string | null
          date_received: string | null
          fentanyl_free: boolean | null
          fentanyl_test_method: string | null
          id: string
          lab_director_name: string | null
          lab_logo_url: string | null
          lab_name: string
          lab_website: string | null
          lot_number: string | null
          methodology: string | null
          notes: string | null
          pdf_url: string | null
          pending: boolean
          position: number
          produced_date: string | null
          product_id: string
          product_label: string | null
          signed_date: string | null
          test_type: string | null
          updated_at: string
          variant_id: string | null
          verified: boolean
        }
        Insert: {
          access_code?: string | null
          appearance?: string | null
          chromatogram_data?: Json | null
          chromatogram_sample_ref?: string | null
          chromatogram_x_label?: string | null
          chromatogram_y_label?: string | null
          coa_number?: string | null
          created_at?: string
          date_confirmed?: string | null
          date_received?: string | null
          fentanyl_free?: boolean | null
          fentanyl_test_method?: string | null
          id?: string
          lab_director_name?: string | null
          lab_logo_url?: string | null
          lab_name: string
          lab_website?: string | null
          lot_number?: string | null
          methodology?: string | null
          notes?: string | null
          pdf_url?: string | null
          pending?: boolean
          position?: number
          produced_date?: string | null
          product_id: string
          product_label?: string | null
          signed_date?: string | null
          test_type?: string | null
          updated_at?: string
          variant_id?: string | null
          verified?: boolean
        }
        Update: {
          access_code?: string | null
          appearance?: string | null
          chromatogram_data?: Json | null
          chromatogram_sample_ref?: string | null
          chromatogram_x_label?: string | null
          chromatogram_y_label?: string | null
          coa_number?: string | null
          created_at?: string
          date_confirmed?: string | null
          date_received?: string | null
          fentanyl_free?: boolean | null
          fentanyl_test_method?: string | null
          id?: string
          lab_director_name?: string | null
          lab_logo_url?: string | null
          lab_name?: string
          lab_website?: string | null
          lot_number?: string | null
          methodology?: string | null
          notes?: string | null
          pdf_url?: string | null
          pending?: boolean
          position?: number
          produced_date?: string | null
          product_id?: string
          product_label?: string | null
          signed_date?: string | null
          test_type?: string | null
          updated_at?: string
          variant_id?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "research_lab_reports_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "research_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_lab_reports_variant_id_fkey"
            columns: ["variant_id"]
            referencedRelation: "research_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      research_product_categories: {
        Row: {
          category_id: string
          product_id: string
        }
        Insert: {
          category_id: string
          product_id: string
        }
        Update: {
          category_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_product_categories_category_id_fkey"
            columns: ["category_id"]
            referencedRelation: "research_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_product_categories_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "research_products"
            referencedColumns: ["id"]
          },
        ]
      }
      research_product_images: {
        Row: {
          alt_text: string | null
          blurhash: string | null
          bucket_name: string
          created_at: string
          height: number | null
          id: string
          is_primary: boolean | null
          is_public: boolean | null
          mime_type: string | null
          object_path: string | null
          position: number | null
          product_id: string
          size_bytes: number | null
          sort_order: number | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          blurhash?: string | null
          bucket_name?: string
          created_at?: string
          height?: number | null
          id?: string
          is_primary?: boolean | null
          is_public?: boolean | null
          mime_type?: string | null
          object_path?: string | null
          position?: number | null
          product_id: string
          size_bytes?: number | null
          sort_order?: number | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          blurhash?: string | null
          bucket_name?: string
          created_at?: string
          height?: number | null
          id?: string
          is_primary?: boolean | null
          is_public?: boolean | null
          mime_type?: string | null
          object_path?: string | null
          position?: number | null
          product_id?: string
          size_bytes?: number | null
          sort_order?: number | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "research_product_images_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "research_products"
            referencedColumns: ["id"]
          },
        ]
      }
      research_product_variants: {
        Row: {
          allow_backorder: boolean
          compare_at_cents: number | null
          compare_at_price_cents: number | null
          created_at: string
          currency: string
          id: string
          inventory_qty: number
          is_active: boolean
          option_values: Json
          options: Json
          options_text: string | null
          position: number | null
          price_cents: number
          product_id: string
          sku: string | null
          title: string
          track_inventory: boolean
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          allow_backorder?: boolean
          compare_at_cents?: number | null
          compare_at_price_cents?: number | null
          created_at?: string
          currency?: string
          id?: string
          inventory_qty?: number
          is_active?: boolean
          option_values?: Json
          options?: Json
          options_text?: string | null
          position?: number | null
          price_cents: number
          product_id: string
          sku?: string | null
          title?: string
          track_inventory?: boolean
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          allow_backorder?: boolean
          compare_at_cents?: number | null
          compare_at_price_cents?: number | null
          created_at?: string
          currency?: string
          id?: string
          inventory_qty?: number
          is_active?: boolean
          option_values?: Json
          options?: Json
          options_text?: string | null
          position?: number | null
          price_cents?: number
          product_id?: string
          sku?: string | null
          title?: string
          track_inventory?: boolean
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "research_product_variants_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "research_products"
            referencedColumns: ["id"]
          },
        ]
      }
      research_products: {
        Row: {
          badge: string | null
          brand: string | null
          cas_number: string | null
          coa_url: string | null
          compare_at_price_cents: number | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          dosage_label: string | null
          featured: boolean
          id: string
          is_featured: boolean | null
          price_cents: number | null
          purity_percent: number | null
          research_use_only: boolean
          search_text: string | null
          slug: string
          status: string
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          badge?: string | null
          brand?: string | null
          cas_number?: string | null
          coa_url?: string | null
          compare_at_price_cents?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          dosage_label?: string | null
          featured?: boolean
          id?: string
          is_featured?: boolean | null
          price_cents?: number | null
          purity_percent?: number | null
          research_use_only?: boolean
          search_text?: string | null
          slug: string
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          badge?: string | null
          brand?: string | null
          cas_number?: string | null
          coa_url?: string | null
          compare_at_price_cents?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          dosage_label?: string | null
          featured?: boolean
          id?: string
          is_featured?: boolean | null
          price_cents?: number | null
          purity_percent?: number | null
          research_use_only?: boolean
          search_text?: string | null
          slug?: string
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      research_references: {
        Row: {
          authors: string | null
          created_at: string
          doi: string | null
          group_key: string
          id: string
          journal: string
          pmid: string | null
          sort_order: number
          title: string
          updated_at: string
          url: string | null
          year: number
        }
        Insert: {
          authors?: string | null
          created_at?: string
          doi?: string | null
          group_key: string
          id?: string
          journal: string
          pmid?: string | null
          sort_order?: number
          title: string
          updated_at?: string
          url?: string | null
          year: number
        }
        Update: {
          authors?: string | null
          created_at?: string
          doi?: string | null
          group_key?: string
          id?: string
          journal?: string
          pmid?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
          url?: string | null
          year?: number
        }
        Relationships: []
      }
      research_stock_notifications: {
        Row: {
          created_at: string
          email: string
          id: string
          notified_at: string | null
          research_product_id: string
          research_variant_id: string | null
          theme_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          notified_at?: string | null
          research_product_id: string
          research_variant_id?: string | null
          theme_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          notified_at?: string | null
          research_product_id?: string
          research_variant_id?: string | null
          theme_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_stock_notifications_research_product_id_fkey"
            columns: ["research_product_id"]
            referencedRelation: "research_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_stock_notifications_research_variant_id_fkey"
            columns: ["research_variant_id"]
            referencedRelation: "research_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      research_variant_images: {
        Row: {
          created_at: string
          image_id: string
          image_type: string
          is_primary: boolean
          position: number
          variant_id: string
        }
        Insert: {
          created_at?: string
          image_id: string
          image_type?: string
          is_primary?: boolean
          position?: number
          variant_id: string
        }
        Update: {
          created_at?: string
          image_id?: string
          image_type?: string
          is_primary?: boolean
          position?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_variant_images_image_id_fkey"
            columns: ["image_id"]
            referencedRelation: "research_product_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_variant_images_variant_id_fkey"
            columns: ["variant_id"]
            referencedRelation: "research_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      review_invites: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          order_id: string
          order_item_id: string | null
          product_id: string
          profile_id: string
          token: string
          used_at: string | null
          variant_id: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          order_id: string
          order_item_id?: string | null
          product_id: string
          profile_id: string
          token?: string
          used_at?: string | null
          variant_id?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          order_id?: string
          order_item_id?: string | null
          product_id?: string
          profile_id?: string
          token?: string
          used_at?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_invites_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "order_history_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_invites_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_invites_order_item_id_fkey"
            columns: ["order_item_id"]
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_invites_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_invites_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_invites_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_invites_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles_ready_for_purge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_invites_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles_with_auth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_invites_variant_id_fkey"
            columns: ["variant_id"]
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          color: string | null
          id: string
          role: string
        }
        Insert: {
          color?: string | null
          id: string
          role: string
        }
        Update: {
          color?: string | null
          id?: string
          role?: string
        }
        Relationships: []
      }
      saved_carts: {
        Row: {
          created_at: string
          deleted_at: string | null
          expires_at: string
          id: string
          item_count: number
          items: Json
          label: string | null
          session_id: string | null
          source_cart_id: string | null
          source_share_name: string | null
          source_share_token: string | null
          subtotal_cents: number
          trigger: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          expires_at?: string
          id?: string
          item_count?: number
          items?: Json
          label?: string | null
          session_id?: string | null
          source_cart_id?: string | null
          source_share_name?: string | null
          source_share_token?: string | null
          subtotal_cents?: number
          trigger?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          expires_at?: string
          id?: string
          item_count?: number
          items?: Json
          label?: string | null
          session_id?: string | null
          source_cart_id?: string | null
          source_share_name?: string | null
          source_share_token?: string | null
          subtotal_cents?: number
          trigger?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_carts_source_cart_id_fkey"
            columns: ["source_cart_id"]
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_migrations: {
        Row: {
          version: string
        }
        Insert: {
          version: string
        }
        Update: {
          version?: string
        }
        Relationships: []
      }
      service_categories: {
        Row: {
          created_at: string
          id: string
          image: string | null
          is_active: boolean
          position: number
          slug: string
          tags: string[]
          translations: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image?: string | null
          is_active?: boolean
          position?: number
          slug: string
          tags?: string[]
          translations?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image?: string | null
          is_active?: boolean
          position?: number
          slug?: string
          tags?: string[]
          translations?: Json
          updated_at?: string
        }
        Relationships: []
      }
      service_nested_list_items: {
        Row: {
          created_at: string
          id: string
          nested_list_id: string
          position: number
          translations: Json
        }
        Insert: {
          created_at?: string
          id?: string
          nested_list_id: string
          position?: number
          translations?: Json
        }
        Update: {
          created_at?: string
          id?: string
          nested_list_id?: string
          position?: number
          translations?: Json
        }
        Relationships: [
          {
            foreignKeyName: "service_nested_list_items_nested_list_id_fkey"
            columns: ["nested_list_id"]
            referencedRelation: "service_nested_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      service_nested_lists: {
        Row: {
          created_at: string
          id: string
          position: number
          sub_service_id: string
          translations: Json
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number
          sub_service_id: string
          translations?: Json
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          sub_service_id?: string
          translations?: Json
        }
        Relationships: [
          {
            foreignKeyName: "service_nested_lists_sub_service_id_fkey"
            columns: ["sub_service_id"]
            referencedRelation: "service_sub_services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_sub_services: {
        Row: {
          category_id: string
          created_at: string
          id: string
          images: string[]
          is_active: boolean
          path: string | null
          position: number
          translations: Json
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          images?: string[]
          is_active?: boolean
          path?: string | null
          position?: number
          translations?: Json
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          images?: string[]
          is_active?: boolean
          path?: string | null
          position?: number
          translations?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_sub_services_category_id_fkey"
            columns: ["category_id"]
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_cart_views: {
        Row: {
          cart_id: string
          cloned: boolean | null
          id: string
          referrer: string | null
          user_agent: string | null
          viewed_at: string
          viewer_session_id: string | null
          viewer_user_id: string | null
        }
        Insert: {
          cart_id: string
          cloned?: boolean | null
          id?: string
          referrer?: string | null
          user_agent?: string | null
          viewed_at?: string
          viewer_session_id?: string | null
          viewer_user_id?: string | null
        }
        Update: {
          cart_id?: string
          cloned?: boolean | null
          id?: string
          referrer?: string | null
          user_agent?: string | null
          viewed_at?: string
          viewer_session_id?: string | null
          viewer_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shared_cart_views_cart_id_fkey"
            columns: ["cart_id"]
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_boxes: {
        Row: {
          created_at: string
          height_in: number
          id: string
          is_active: boolean
          is_default: boolean
          length_in: number
          name: string
          updated_at: string
          width_in: number
        }
        Insert: {
          created_at?: string
          height_in: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          length_in: number
          name: string
          updated_at?: string
          width_in: number
        }
        Update: {
          created_at?: string
          height_in?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          length_in?: number
          name?: string
          updated_at?: string
          width_in?: number
        }
        Relationships: []
      }
      shipping_origin: {
        Row: {
          city: string | null
          company: string | null
          country: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          line1: string | null
          line2: string | null
          name: string | null
          phone: string | null
          postal_code: string | null
          region: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          line1?: string | null
          line2?: string | null
          name?: string | null
          phone?: string | null
          postal_code?: string | null
          region?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          line1?: string | null
          line2?: string | null
          name?: string | null
          phone?: string | null
          postal_code?: string | null
          region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      shipping_profiles: {
        Row: {
          created_at: string
          currency: string
          free_shipping_threshold_cents: number | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          free_shipping_threshold_cents?: number | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          free_shipping_threshold_cents?: number | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      shipping_rates: {
        Row: {
          carrier: string | null
          country: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          max_delivery_days: number | null
          max_subtotal_cents: number | null
          min_delivery_days: number | null
          min_subtotal_cents: number | null
          name: string
          position: number
          price_cents: number
          provider_hint: string | null
          region: string | null
          service_code: string | null
          shipping_profile_id: string
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_delivery_days?: number | null
          max_subtotal_cents?: number | null
          min_delivery_days?: number | null
          min_subtotal_cents?: number | null
          name: string
          position?: number
          price_cents: number
          provider_hint?: string | null
          region?: string | null
          service_code?: string | null
          shipping_profile_id: string
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_delivery_days?: number | null
          max_subtotal_cents?: number | null
          min_delivery_days?: number | null
          min_subtotal_cents?: number | null
          name?: string
          position?: number
          price_cents?: number
          provider_hint?: string | null
          region?: string | null
          service_code?: string | null
          shipping_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_rates_shipping_profile_id_fkey"
            columns: ["shipping_profile_id"]
            referencedRelation: "shipping_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_banner_group_items: {
        Row: {
          created_at: string
          group_id: string
          id: string
          is_enabled: boolean
          position: number
          text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          is_enabled?: boolean
          position?: number
          text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          is_enabled?: boolean
          position?: number
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_banner_group_items_group_id_fkey"
            columns: ["group_id"]
            referencedRelation: "site_banner_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      site_banner_groups: {
        Row: {
          active_days: number[] | null
          banner_id: string
          created_at: string
          end_date: string | null
          end_time: string | null
          id: string
          is_enabled: boolean
          label: string | null
          position: number
          start_date: string | null
          start_time: string | null
          text: string
          timezone: string
          updated_at: string
        }
        Insert: {
          active_days?: number[] | null
          banner_id: string
          created_at?: string
          end_date?: string | null
          end_time?: string | null
          id?: string
          is_enabled?: boolean
          label?: string | null
          position?: number
          start_date?: string | null
          start_time?: string | null
          text?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          active_days?: number[] | null
          banner_id?: string
          created_at?: string
          end_date?: string | null
          end_time?: string | null
          id?: string
          is_enabled?: boolean
          label?: string | null
          position?: number
          start_date?: string | null
          start_time?: string | null
          text?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_banner_groups_banner_id_fkey"
            columns: ["banner_id"]
            referencedRelation: "site_banners"
            referencedColumns: ["id"]
          },
        ]
      }
      site_banner_items: {
        Row: {
          banner_id: string
          id: string
          is_enabled: boolean
          position: number
          text: string
        }
        Insert: {
          banner_id: string
          id?: string
          is_enabled?: boolean
          position?: number
          text: string
        }
        Update: {
          banner_id?: string
          id?: string
          is_enabled?: boolean
          position?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_banner_items_banner_id_fkey"
            columns: ["banner_id"]
            referencedRelation: "site_banners"
            referencedColumns: ["id"]
          },
        ]
      }
      site_banners: {
        Row: {
          animation_speed_ms: number
          display_mode: string
          id: string
          is_enabled: boolean
          key: string
          pause_on_hover: boolean
          rotation_interval_ms: number
          separator: string
          updated_at: string
        }
        Insert: {
          animation_speed_ms?: number
          display_mode?: string
          id?: string
          is_enabled?: boolean
          key: string
          pause_on_hover?: boolean
          rotation_interval_ms?: number
          separator?: string
          updated_at?: string
        }
        Update: {
          animation_speed_ms?: number
          display_mode?: string
          id?: string
          is_enabled?: boolean
          key?: string
          pause_on_hover?: boolean
          rotation_interval_ms?: number
          separator?: string
          updated_at?: string
        }
        Relationships: []
      }
      static_pages: {
        Row: {
          content: string
          content_format: string
          created_at: string
          id: string
          is_published: boolean
          meta_description: string | null
          meta_keywords: string[] | null
          og_image_url: string | null
          published_at: string | null
          slug: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          content: string
          content_format?: string
          created_at?: string
          id?: string
          is_published?: boolean
          meta_description?: string | null
          meta_keywords?: string[] | null
          og_image_url?: string | null
          published_at?: string | null
          slug: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          content?: string
          content_format?: string
          created_at?: string
          id?: string
          is_published?: boolean
          meta_description?: string | null
          meta_keywords?: string[] | null
          og_image_url?: string | null
          published_at?: string | null
          slug?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      static_pages_backup_20260613: {
        Row: {
          backed_up_at: string | null
          content: string | null
          id: string | null
          slug: string | null
        }
        Insert: {
          backed_up_at?: string | null
          content?: string | null
          id?: string | null
          slug?: string | null
        }
        Update: {
          backed_up_at?: string | null
          content?: string | null
          id?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      tags: {
        Row: {
          id: string
          name: string
          slug: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      tank_archives: {
        Row: {
          aired_at: string | null
          created_at: string
          description: string | null
          duration_seconds: number
          end_time: string | null
          episode_number: number | null
          file_name: string | null
          file_size_bytes: number | null
          id: string
          metadata: Json | null
          recorded_date: string
          room_slug: string | null
          season_slug: string
          start_time: string
          storage_bucket: string
          storage_path: string | null
          thumbnail_url: string | null
          title: string
          video_url: string | null
        }
        Insert: {
          aired_at?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number
          end_time?: string | null
          episode_number?: number | null
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          metadata?: Json | null
          recorded_date?: string
          room_slug?: string | null
          season_slug?: string
          start_time?: string
          storage_bucket?: string
          storage_path?: string | null
          thumbnail_url?: string | null
          title: string
          video_url?: string | null
        }
        Update: {
          aired_at?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number
          end_time?: string | null
          episode_number?: number | null
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          metadata?: Json | null
          recorded_date?: string
          room_slug?: string | null
          season_slug?: string
          start_time?: string
          storage_bucket?: string
          storage_path?: string | null
          thumbnail_url?: string | null
          title?: string
          video_url?: string | null
        }
        Relationships: []
      }
      tank_audio_requests: {
        Row: {
          cost: number
          created_at: string
          id: string
          kind: string
          message: string | null
          moderated_at: string | null
          moderated_by: string | null
          refund_transaction_id: string | null
          status: string
          target_room_key: string | null
          target_type: string
          token_transaction_id: string | null
          user_id: string
          voice_or_sound_key: string
        }
        Insert: {
          cost: number
          created_at?: string
          id?: string
          kind: string
          message?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          refund_transaction_id?: string | null
          status?: string
          target_room_key?: string | null
          target_type?: string
          token_transaction_id?: string | null
          user_id: string
          voice_or_sound_key: string
        }
        Update: {
          cost?: number
          created_at?: string
          id?: string
          kind?: string
          message?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          refund_transaction_id?: string | null
          status?: string
          target_room_key?: string | null
          target_type?: string
          token_transaction_id?: string | null
          user_id?: string
          voice_or_sound_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "tank_audio_requests_refund_transaction_id_fkey"
            columns: ["refund_transaction_id"]
            referencedRelation: "tank_token_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_audio_requests_target_room_key_fkey"
            columns: ["target_room_key"]
            referencedRelation: "tank_rooms"
            referencedColumns: ["room_key"]
          },
          {
            foreignKeyName: "tank_audio_requests_token_transaction_id_fkey"
            columns: ["token_transaction_id"]
            referencedRelation: "tank_token_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_audio_sources: {
        Row: {
          channels: number | null
          codec: string | null
          connection_hint: string | null
          created_at: string
          id: string
          kind: string
          name: string
          online: boolean
          room_scope: string
          sample_rate_hz: number | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          channels?: number | null
          codec?: string | null
          connection_hint?: string | null
          created_at?: string
          id: string
          kind: string
          name: string
          online?: boolean
          room_scope?: string
          sample_rate_hz?: number | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          channels?: number | null
          codec?: string | null
          connection_hint?: string | null
          created_at?: string
          id?: string
          kind?: string
          name?: string
          online?: boolean
          room_scope?: string
          sample_rate_hz?: number | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      tank_camera_registry: {
        Row: {
          accent: string | null
          audio_mode: string
          audio_source_id: string | null
          audio_source_name: string | null
          audio_status: string
          audio_warning: string | null
          bitrate_kbps: number | null
          camera_id: string
          created_at: string
          cross_room_audio_confirmed: boolean
          description: string | null
          disconnected_at: string | null
          has_been_live: boolean
          has_native_audio: boolean
          key_fingerprint: string | null
          last_seen_at: string | null
          latency_ms: number | null
          location: string | null
          name: string
          native_audio_muted: boolean
          priority: number
          protocol: string
          public_visible: boolean
          retire_at: string | null
          room_scope: string
          status: string
          stream_key: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          accent?: string | null
          audio_mode?: string
          audio_source_id?: string | null
          audio_source_name?: string | null
          audio_status?: string
          audio_warning?: string | null
          bitrate_kbps?: number | null
          camera_id: string
          created_at?: string
          cross_room_audio_confirmed?: boolean
          description?: string | null
          disconnected_at?: string | null
          has_been_live?: boolean
          has_native_audio?: boolean
          key_fingerprint?: string | null
          last_seen_at?: string | null
          latency_ms?: number | null
          location?: string | null
          name: string
          native_audio_muted?: boolean
          priority?: number
          protocol?: string
          public_visible?: boolean
          retire_at?: string | null
          room_scope?: string
          status?: string
          stream_key: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          accent?: string | null
          audio_mode?: string
          audio_source_id?: string | null
          audio_source_name?: string | null
          audio_status?: string
          audio_warning?: string | null
          bitrate_kbps?: number | null
          camera_id?: string
          created_at?: string
          cross_room_audio_confirmed?: boolean
          description?: string | null
          disconnected_at?: string | null
          has_been_live?: boolean
          has_native_audio?: boolean
          key_fingerprint?: string | null
          last_seen_at?: string | null
          latency_ms?: number | null
          location?: string | null
          name?: string
          native_audio_muted?: boolean
          priority?: number
          protocol?: string
          public_visible?: boolean
          retire_at?: string | null
          room_scope?: string
          status?: string
          stream_key?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      tank_chat_messages: {
        Row: {
          body: string
          click_id: string | null
          client_nonce: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          edited_at: string | null
          id: string
          item_slug: string | null
          message_type: string | null
          metadata: Json | null
          reply_to_message_id: string | null
          reply_to_user_id: string | null
          room_id: string
          user_id: string | null
          user_name: string
          user_role: string
        }
        Insert: {
          body: string
          click_id?: string | null
          client_nonce?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          edited_at?: string | null
          id?: string
          item_slug?: string | null
          message_type?: string | null
          metadata?: Json | null
          reply_to_message_id?: string | null
          reply_to_user_id?: string | null
          room_id: string
          user_id?: string | null
          user_name: string
          user_role?: string
        }
        Update: {
          body?: string
          click_id?: string | null
          client_nonce?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          edited_at?: string | null
          id?: string
          item_slug?: string | null
          message_type?: string | null
          metadata?: Json | null
          reply_to_message_id?: string | null
          reply_to_user_id?: string | null
          room_id?: string
          user_id?: string | null
          user_name?: string
          user_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "tank_chat_messages_click_id_fkey"
            columns: ["click_id"]
            isOneToOne: false
            referencedRelation: "tank_clicks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_chat_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "tank_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_chat_reactions: {
        Row: { created_at: string; message_id: string; reaction: string; user_id: string }
        Insert: { created_at?: string; message_id: string; reaction: string; user_id: string }
        Update: { created_at?: string; message_id?: string; reaction?: string; user_id?: string }
        Relationships: [
          {
            foreignKeyName: "tank_chat_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "tank_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_click_members: {
        Row: {
          click_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          click_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          click_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tank_clan_members_clan_id_fkey"
            columns: ["click_id"]
            referencedRelation: "tank_clicks"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_clicks: {
        Row: {
          banner_color: string
          created_at: string
          description: string | null
          id: string
          name: string
          tag: string
        }
        Insert: {
          banner_color?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          tag: string
        }
        Update: {
          banner_color?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          tag?: string
        }
        Relationships: []
      }
      tank_ingest_events: {
        Row: {
          camera_id: string
          created_at: string
          details: Json | null
          event_type: string
          id: string
        }
        Insert: {
          camera_id: string
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
        }
        Update: {
          camera_id?: string
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tank_ingest_events_camera_id_fkey"
            columns: ["camera_id"]
            referencedRelation: "tank_camera_registry"
            referencedColumns: ["camera_id"]
          },
        ]
      }
      tank_inventory_items: {
        Row: {
          created_at: string
          description: string | null
          icon_url: string | null
          id: string
          is_active: boolean
          name: string
          rarity: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean
          name: string
          rarity?: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean
          name?: string
          rarity?: string
          slug?: string
        }
        Relationships: []
      }
      tank_mission_progress: {
        Row: {
          completed_at: string | null
          mission_id: string
          progress: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          mission_id: string
          progress?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          mission_id?: string
          progress?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tank_mission_progress_mission_id_fkey"
            columns: ["mission_id"]
            referencedRelation: "tank_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_missions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          reward_tokens: number
          reward_xp: number
          season_id: string | null
          sort_order: number
          target_count: number
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          reward_tokens?: number
          reward_xp?: number
          season_id?: string | null
          sort_order?: number
          target_count?: number
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          reward_tokens?: number
          reward_xp?: number
          season_id?: string | null
          sort_order?: number
          target_count?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tank_missions_season_id_fkey"
            columns: ["season_id"]
            referencedRelation: "tank_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_platform_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      tank_player_inventory: {
        Row: {
          acquired_at: string
          item_id: string
          quantity: number
          user_id: string
        }
        Insert: {
          acquired_at?: string
          item_id: string
          quantity?: number
          user_id: string
        }
        Update: {
          acquired_at?: string
          item_id?: string
          quantity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tank_player_inventory_item_id_fkey"
            columns: ["item_id"]
            referencedRelation: "tank_inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_daily_claims: {
        Row: {
          claimed_at: string
          id: number
          streak_tick: number
          tokens_awarded: number
          total_claims: number
          user_id: string
          xp_awarded: number
        }
        Insert: {
          claimed_at?: string
          id?: never
          streak_tick: number
          tokens_awarded?: number
          total_claims: number
          user_id: string
          xp_awarded?: number
        }
        Update: {
          claimed_at?: string
          id?: never
          streak_tick?: number
          tokens_awarded?: number
          total_claims?: number
          user_id?: string
          xp_awarded?: number
        }
        Relationships: []
      }
      tank_profiles: {
        Row: {
          created_at: string
          daily_claim_count: number
          daily_streak: number
          display_name: string | null
          last_daily_claim_at: string | null
          level: number
          longest_daily_streak: number
          tokens: number
          updated_at: string
          user_id: string
          xp: number
        }
        Insert: {
          created_at?: string
          daily_claim_count?: number
          daily_streak?: number
          display_name?: string | null
          last_daily_claim_at?: string | null
          level?: number
          longest_daily_streak?: number
          tokens?: number
          updated_at?: string
          user_id: string
          xp?: number
        }
        Update: {
          created_at?: string
          daily_claim_count?: number
          daily_streak?: number
          display_name?: string | null
          last_daily_claim_at?: string | null
          level?: number
          longest_daily_streak?: number
          tokens?: number
          updated_at?: string
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
      tank_rooms: {
        Row: {
          audio_output_config: Json
          audio_output_kind: string
          description: string | null
          eyebrow: string | null
          room_key: string
          tags: string[]
          title: string | null
          updated_at: string
          visibility_policy: string | null
        }
        Insert: {
          audio_output_config?: Json
          audio_output_kind?: string
          description?: string | null
          eyebrow?: string | null
          room_key: string
          tags?: string[]
          title?: string | null
          updated_at?: string
          visibility_policy?: string | null
        }
        Update: {
          audio_output_config?: Json
          audio_output_kind?: string
          description?: string | null
          eyebrow?: string | null
          room_key?: string
          tags?: string[]
          title?: string | null
          updated_at?: string
          visibility_policy?: string | null
        }
        Relationships: []
      }
      tank_season_progress: {
        Row: {
          season_id: string
          tier: number
          user_id: string
          xp: number
        }
        Insert: {
          season_id: string
          tier?: number
          user_id: string
          xp?: number
        }
        Update: {
          season_id?: string
          tier?: number
          user_id?: string
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "tank_season_progress_season_id_fkey"
            columns: ["season_id"]
            referencedRelation: "tank_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_seasons: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          is_active: boolean
          name: string
          number: number
          starts_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          number: number
          starts_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          number?: number
          starts_at?: string
        }
        Relationships: []
      }
      tank_theme_assets: {
        Row: {
          asset_key: string
          created_at: string
          format: string | null
          id: string
          kind: string
          public_url: string
          storage_bucket: string
          storage_path: string
          theme_id: string
        }
        Insert: {
          asset_key: string
          created_at?: string
          format?: string | null
          id?: string
          kind: string
          public_url: string
          storage_bucket?: string
          storage_path: string
          theme_id: string
        }
        Update: {
          asset_key?: string
          created_at?: string
          format?: string | null
          id?: string
          kind?: string
          public_url?: string
          storage_bucket?: string
          storage_path?: string
          theme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tank_theme_assets_theme_id_fkey"
            columns: ["theme_id"]
            referencedRelation: "tank_themes"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_themes: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          is_active?: boolean
          label: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      tank_token_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          reason: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      tax_rates: {
        Row: {
          city: string | null
          country: string
          county: string | null
          created_at: string
          description: string | null
          effective_from: string | null
          effective_until: string | null
          id: string
          is_active: boolean | null
          rate: number
          state: string | null
          type: string
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          city?: string | null
          country?: string
          county?: string | null
          created_at?: string
          description?: string | null
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          is_active?: boolean | null
          rate: number
          state?: string | null
          type: string
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          city?: string | null
          country?: string
          county?: string | null
          created_at?: string
          description?: string | null
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          is_active?: boolean | null
          rate?: number
          state?: string | null
          type?: string
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          image_url: string
          is_active: boolean
          position: number
          tags: string[]
          translations: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          is_active?: boolean
          position?: number
          tags?: string[]
          translations?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          is_active?: boolean
          position?: number
          tags?: string[]
          translations?: Json
          updated_at?: string
        }
        Relationships: []
      }
      themes: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          download_count: number | null
          id: string
          is_active: boolean | null
          is_system: boolean | null
          meta_data: Json | null
          name: string
          preview_color: string | null
          tags: string[] | null
          theme_data: Json
          updated_at: string | null
          version: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          download_count?: number | null
          id: string
          is_active?: boolean | null
          is_system?: boolean | null
          meta_data?: Json | null
          name: string
          preview_color?: string | null
          tags?: string[] | null
          theme_data: Json
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          download_count?: number | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          meta_data?: Json | null
          name?: string
          preview_color?: string | null
          tags?: string[] | null
          theme_data?: Json
          updated_at?: string | null
          version?: number | null
        }
        Relationships: []
      }
      variant_images: {
        Row: {
          created_at: string
          image_id: string
          is_primary: boolean
          position: number
          variant_id: string
        }
        Insert: {
          created_at?: string
          image_id: string
          is_primary?: boolean
          position?: number
          variant_id: string
        }
        Update: {
          created_at?: string
          image_id?: string
          is_primary?: boolean
          position?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_images_image_id_fkey"
            columns: ["image_id"]
            referencedRelation: "product_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_images_variant_id_fkey"
            columns: ["variant_id"]
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      zone_audit_events: {
        Row: {
          action: string
          actor: string | null
          after: Json | null
          at: string
          before: Json | null
          id: number
          payload_version: string | null
          source: string | null
          zone_key: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          id?: never
          payload_version?: string | null
          source?: string | null
          zone_key?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          id?: never
          payload_version?: string | null
          source?: string | null
          zone_key?: string | null
        }
        Relationships: []
      }
      zone_deployments: {
        Row: {
          container_state: string | null
          created_at: string
          deployed_revision: string | null
          env_id: string
          id: string
          image_digest: string | null
          last_deploy_at: string | null
          last_proxy_verified_at: string | null
          metadata: Json
          observed_at: string | null
          role: string
          updated_at: string
          zone_key: string
        }
        Insert: {
          container_state?: string | null
          created_at?: string
          deployed_revision?: string | null
          env_id: string
          id?: string
          image_digest?: string | null
          last_deploy_at?: string | null
          last_proxy_verified_at?: string | null
          metadata?: Json
          observed_at?: string | null
          role?: string
          updated_at?: string
          zone_key: string
        }
        Update: {
          container_state?: string | null
          created_at?: string
          deployed_revision?: string | null
          env_id?: string
          id?: string
          image_digest?: string | null
          last_deploy_at?: string | null
          last_proxy_verified_at?: string | null
          metadata?: Json
          observed_at?: string | null
          role?: string
          updated_at?: string
          zone_key?: string
        }
        Relationships: []
      }
      zone_endpoint_checks: {
        Row: {
          checked_at: string
          failure_reason: string | null
          http_status: number | null
          id: number
          ok: boolean | null
          response_time_ms: number | null
          zone_key: string
        }
        Insert: {
          checked_at?: string
          failure_reason?: string | null
          http_status?: number | null
          id?: never
          ok?: boolean | null
          response_time_ms?: number | null
          zone_key: string
        }
        Update: {
          checked_at?: string
          failure_reason?: string | null
          http_status?: number | null
          id?: never
          ok?: boolean | null
          response_time_ms?: number | null
          zone_key?: string
        }
        Relationships: []
      }
      zone_endpoint_status: {
        Row: {
          checked_at: string | null
          consecutive_failures: number
          failure_reason: string | null
          http_status: number | null
          public_status: Database["public"]["Enums"]["zone_public_status"]
          response_time_ms: number | null
          zone_key: string
        }
        Insert: {
          checked_at?: string | null
          consecutive_failures?: number
          failure_reason?: string | null
          http_status?: number | null
          public_status?: Database["public"]["Enums"]["zone_public_status"]
          response_time_ms?: number | null
          zone_key: string
        }
        Update: {
          checked_at?: string | null
          consecutive_failures?: number
          failure_reason?: string | null
          http_status?: number | null
          public_status?: Database["public"]["Enums"]["zone_public_status"]
          response_time_ms?: number | null
          zone_key?: string
        }
        Relationships: []
      }
      zone_sync_runs: {
        Row: {
          actor: string | null
          conflict_count: number
          created_count: number
          dry_run: boolean
          finished_at: string | null
          id: string
          missing_count: number
          result: string | null
          source: string
          started_at: string
          updated_count: number
          warnings: Json
        }
        Insert: {
          actor?: string | null
          conflict_count?: number
          created_count?: number
          dry_run?: boolean
          finished_at?: string | null
          id?: string
          missing_count?: number
          result?: string | null
          source?: string
          started_at?: string
          updated_count?: number
          warnings?: Json
        }
        Update: {
          actor?: string | null
          conflict_count?: number
          created_count?: number
          dry_run?: boolean
          finished_at?: string | null
          id?: string
          missing_count?: number
          result?: string | null
          source?: string
          started_at?: string
          updated_count?: number
          warnings?: Json
        }
        Relationships: []
      }
      zones: {
        Row: {
          container: string
          created_at: string
          description: string | null
          dockerfile: string | null
          domain: string
          enabled: boolean
          environment_id: string | null
          expected_status: number
          footer_pinned: boolean
          health_path: string
          id: string
          image: string
          image_url: string | null
          include_in_sitemap: boolean
          key: string
          label: string
          last_synced_at: string | null
          lifecycle_state: Database["public"]["Enums"]["zone_lifecycle_state"]
          metadata: Json
          og_image_alt: string | null
          og_image_bucket: string | null
          og_image_bytes: number | null
          og_image_height: number | null
          og_image_mime_type: string | null
          og_image_original_name: string | null
          og_image_path: string | null
          og_image_source_height: number | null
          og_image_source_width: number | null
          og_image_updated_at: string | null
          og_image_width: number | null
          service: string
          show_in_directory: boolean
          show_in_footer: boolean
          site_icon_bucket: string | null
          site_icon_bytes: number | null
          site_icon_original_name: string | null
          site_icon_path: string | null
          site_icon_source_height: number | null
          site_icon_source_width: number | null
          site_icon_updated_at: string | null
          sort_order: number
          source: string
          updated_at: string
          upstream_env_key: string
          visibility: Database["public"]["Enums"]["zone_visibility"]
        }
        Insert: {
          container: string
          created_at?: string
          description?: string | null
          dockerfile?: string | null
          domain: string
          enabled?: boolean
          environment_id?: string | null
          expected_status?: number
          footer_pinned?: boolean
          health_path?: string
          id?: string
          image: string
          image_url?: string | null
          include_in_sitemap?: boolean
          key: string
          label: string
          last_synced_at?: string | null
          lifecycle_state?: Database["public"]["Enums"]["zone_lifecycle_state"]
          metadata?: Json
          og_image_alt?: string | null
          og_image_bucket?: string | null
          og_image_bytes?: number | null
          og_image_height?: number | null
          og_image_mime_type?: string | null
          og_image_original_name?: string | null
          og_image_path?: string | null
          og_image_source_height?: number | null
          og_image_source_width?: number | null
          og_image_updated_at?: string | null
          og_image_width?: number | null
          service: string
          show_in_directory?: boolean
          show_in_footer?: boolean
          site_icon_bucket?: string | null
          site_icon_bytes?: number | null
          site_icon_original_name?: string | null
          site_icon_path?: string | null
          site_icon_source_height?: number | null
          site_icon_source_width?: number | null
          site_icon_updated_at?: string | null
          sort_order?: number
          source?: string
          updated_at?: string
          upstream_env_key: string
          visibility?: Database["public"]["Enums"]["zone_visibility"]
        }
        Update: {
          container?: string
          created_at?: string
          description?: string | null
          dockerfile?: string | null
          domain?: string
          enabled?: boolean
          environment_id?: string | null
          expected_status?: number
          footer_pinned?: boolean
          health_path?: string
          id?: string
          image?: string
          image_url?: string | null
          include_in_sitemap?: boolean
          key?: string
          label?: string
          last_synced_at?: string | null
          lifecycle_state?: Database["public"]["Enums"]["zone_lifecycle_state"]
          metadata?: Json
          og_image_alt?: string | null
          og_image_bucket?: string | null
          og_image_bytes?: number | null
          og_image_height?: number | null
          og_image_mime_type?: string | null
          og_image_original_name?: string | null
          og_image_path?: string | null
          og_image_source_height?: number | null
          og_image_source_width?: number | null
          og_image_updated_at?: string | null
          og_image_width?: number | null
          service?: string
          show_in_directory?: boolean
          show_in_footer?: boolean
          site_icon_bucket?: string | null
          site_icon_bytes?: number | null
          site_icon_original_name?: string | null
          site_icon_path?: string | null
          site_icon_source_height?: number | null
          site_icon_source_width?: number | null
          site_icon_updated_at?: string | null
          sort_order?: number
          source?: string
          updated_at?: string
          upstream_env_key?: string
          visibility?: Database["public"]["Enums"]["zone_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "zones_environment_id_fkey"
            columns: ["environment_id"]
            referencedRelation: "environments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      analytics_events_labeled: {
        Row: {
          audience: string | null
          created_at: string | null
          event_action: string | null
          event_category: string | null
          event_label: string | null
          event_name: string | null
          event_value: number | null
          id: string | null
          metadata: Json | null
          page_url: string | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          audience?: never
          created_at?: string | null
          event_action?: string | null
          event_category?: string | null
          event_label?: string | null
          event_name?: string | null
          event_value?: number | null
          id?: string | null
          metadata?: Json | null
          page_url?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          audience?: never
          created_at?: string | null
          event_action?: string | null
          event_category?: string | null
          event_label?: string | null
          event_name?: string | null
          event_value?: number | null
          id?: string | null
          metadata?: Json | null
          page_url?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "analytics_users"
            referencedColumns: ["id"]
          },
        ]
      }
      order_history_view: {
        Row: {
          auth_user_id: string | null
          created_at: string | null
          currency: string | null
          customer_email: string | null
          discount_cents: number | null
          email: string | null
          id: string | null
          item_types_count: number | null
          items: Json | null
          order_number: string | null
          payment_status: string | null
          promo_code: string | null
          shipping_address: Json | null
          shipping_cents: number | null
          shipping_method_name: string | null
          status: string | null
          subtotal_cents: number | null
          tax_cents: number | null
          total_cents: number | null
          total_items: number | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
      profiles_admin_view: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          created_at: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by_auth_user_id: string | null
          display_name: string | null
          email: string | null
          id: string | null
          is_active: boolean | null
          is_deleted: boolean | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by_auth_user_id?: string | null
          display_name?: string | null
          email?: string | null
          id?: string | null
          is_active?: boolean | null
          is_deleted?: never
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by_auth_user_id?: string | null
          display_name?: string | null
          email?: string | null
          id?: string | null
          is_active?: boolean | null
          is_deleted?: never
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles_ready_for_purge: {
        Row: {
          delete_reason: string | null
          deleted_at: string | null
          deleted_by_auth_user_id: string | null
          display_name: string | null
          email: string | null
          id: string | null
          updated_at: string | null
        }
        Insert: {
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by_auth_user_id?: string | null
          display_name?: string | null
          email?: string | null
          id?: string | null
          updated_at?: string | null
        }
        Update: {
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by_auth_user_id?: string | null
          display_name?: string | null
          email?: string | null
          id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles_with_auth: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          email: string | null
          id: string | null
          initials: string | null
          role: string | null
        }
        Relationships: []
      }
      tank_leaderboard: {
        Row: {
          clan_id: string | null
          clan_tag: string | null
          display_name: string | null
          level: number | null
          rank: number | null
          tokens: number | null
          user_id: string | null
          xp: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tank_clan_members_clan_id_fkey"
            columns: ["clan_id"]
            referencedRelation: "tank_clicks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_unread_messages: {
        Row: {
          channel_id: string | null
          channel_name: string | null
          latest_message_time: string | null
          unread_count: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_participants_channel_id_fkey"
            columns: ["channel_id"]
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_participants_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_participants_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_participants_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles_ready_for_purge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_participants_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles_with_auth"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      tank_claim_daily_streak: {
        Args: { p_user_id: string }
        Returns: Json
      }
      tank_insert_chat_message: {
        Args: {
          p_body: string
          p_client_nonce?: string | null
          p_reply_to_message_id?: string | null
          p_room_id: string
          p_user_id: string
          p_user_name: string
          p_user_role: string
        }
        Returns: Database["public"]["Tables"]["tank_chat_messages"]["Row"]
      }
      tank_human_presence_snapshot: {
        Args: { p_ttl_seconds?: number }
        Returns: {
          anonymous: number
          automated: number
          members: number
          on_cellular: number
          online: number
          shared_connections: number
        }[]
      }
      add_admin_note: {
        Args: {
          admin_id_param: string
          note_date_param: string
          title_param: string
          note_param: string
          note_type_param?: string
          priority_param?: string
          target_audience_param?: string
          expires_at_param?: string
        }
        Returns: string
      }
      add_business_to_instance: {
        Args: {
          p_instance_id: number
          p_business_id: number
          p_reason?: string
        }
        Returns: {
          success: boolean
          item_id: number
          message: string
        }[]
      }
      aggregate_daily_stats: {
        Args: {
          target_date?: string
        }
        Returns: undefined
      }
      apply_promo_code: {
        Args: {
          p_code: string
          p_subtotal_cents: number
          p_user_id?: string
        }
        Returns: {
          is_valid: boolean
          discount_cents: number
          error_message: string
        }[]
      }
      approve_work_hours: {
        Args: {
          work_entry_id: string
          approved_by_param: string
        }
        Returns: boolean
      }
      assign_specialization: {
        Args: {
          target_user_id: string
          spec_id: string
          assigner_id: string
        }
        Returns: boolean
      }
      calculate_order_tax: {
        Args: {
          p_subtotal_cents: number
          p_shipping_cents: number
          p_state: string
        }
        Returns: number
      }
      check_orphaned_calendar_records: {
        Args: Record<PropertyKey, never>
        Returns: {
          orphaned_reports_count: number
          orphaned_events_count: number
          oldest_orphaned_date: string
        }[]
      }
      check_role_permission: {
        Args: {
          user_role_type: string
          permission_to_check: string
          resource_type_param?: string
        }
        Returns: boolean
      }
      check_user_permission: {
        Args: {
          user_uuid: string
          user_role_type: string
          permission_resource: string
          permission_action: string
        }
        Returns: boolean
      }
      claim_guest_orders: {
        Args: {
          p_auth_user_id: string
          p_email: string
          p_guest_key?: string
        }
        Returns: number
      }
      cleanup_old_analytics_data: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_old_orphaned_records: {
        Args: {
          days_old?: number
        }
        Returns: string
      }
      cleanup_orphaned_calendar_hour_links: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      cleanup_orphaned_calendar_records: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      clear_user_conversations: {
        Args: {
          p_user_id: string
        }
        Returns: undefined
      }
      confirm_discount_reservation: {
        Args: {
          p_reservation_id: string
        }
        Returns: undefined
      }
      create_category_section:
        | {
            Args: {
              p_section: string
            }
            Returns: number
          }
        | {
            Args: {
              p_section: string
              p_template?: string
            }
            Returns: undefined
          }
      create_direct_channel: {
        Args: {
          user1_id: string
          user2_id: string
        }
        Returns: string
      }
      create_folder_path: {
        Args: {
          p_path: string
          p_user_id: string
        }
        Returns: string
      }
      create_or_get_group_channel:
        | {
            Args: {
              p_creator_id: string
              p_channel_name: string
              p_participant_ids: string[]
            }
            Returns: string
          }
        | {
            Args: {
              p_name: string
              p_creator: string
              p_participant_ids: string[]
            }
            Returns: string
          }
      create_order_from_cart: {
        Args: {
          p_cart_id: string
          p_email: string
          p_shipping_address: Json
          p_billing_address: Json
          p_phone?: string
          p_customer_notes?: string
          p_promo_code?: string
        }
        Returns: string
      }
      create_payment_intent_order: {
        Args: {
          p_cart_id: string
          p_email: string
          p_shipping_address: Json
          p_billing_address: Json
          p_phone?: string
          p_customer_notes?: string
          p_promo_code?: string
          p_shipping_rate_id?: string
          p_customer_ip?: unknown
          p_user_agent?: string
        }
        Returns: {
          order_id: string
          order_number: string
          total_cents: number
          needs_payment_intent: boolean
        }[]
      }
      credit_creator_commission: {
        Args: {
          p_order_id: string
          p_promo_code: string
          p_discount_cents: number
          p_order_number: string
        }
        Returns: undefined
      }
      custom_query: {
        Args: Record<PropertyKey, never>
        Returns: {
          business_name: string
        }[]
      }
      delete_conversation: {
        Args: {
          p_channel_id: string
          p_user_id: string
        }
        Returns: Json
      }
      delete_document: {
        Args: {
          p_document_id: string
          p_user_id: string
        }
        Returns: number
      }
      detect_device_type: {
        Args: {
          user_agent: string
        }
        Returns: string
      }
      disable_cart_sharing: {
        Args: {
          p_cart_id: string
        }
        Returns: undefined
      }
      enable_cart_sharing: {
        Args: {
          p_cart_id: string
          p_share_name?: string
          p_share_message?: string
          p_days_valid?: number
        }
        Returns: {
          share_token: string
          share_url: string
        }[]
      }
      extract_browser: {
        Args: {
          user_agent: string
        }
        Returns: string
      }
      extract_os: {
        Args: {
          user_agent: string
        }
        Returns: string
      }
      fetch_schedule: {
        Args: {
          input_week: number
          input_day: string
        }
        Returns: {
          business_name: string
        }[]
      }
      find_and_delete_coach_report_for_calendar_event: {
        Args: {
          event_id: string
        }
        Returns: boolean
      }
      find_or_create_dm: {
        Args: {
          p_user1_id: string
          p_user2_id: string
        }
        Returns: {
          channel_id: string
          created: boolean
        }[]
      }
      generate_order_number: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      generate_share_token: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      generate_slug: {
        Args: {
          input_text: string
        }
        Returns: string
      }
      get_available_locations: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          location_name: string
          location_type: string
          source: string
        }[]
      }
      get_available_time_slots: {
        Args: {
          coach_id_param: string
          target_date: string
          slot_duration_minutes?: number
        }
        Returns: {
          start_time: string
          end_time: string
          is_available: boolean
        }[]
      }
      get_businesses_moved_to_date: {
        Args: {
          target_date: string
        }
        Returns: {
          business_id: number
          business_name: string
          address: string
          before_open: boolean
          original_date: string
          original_day: string
          notes: string
          moved_at: string
        }[]
      }
      get_channel_messages: {
        Args: {
          p_channel_id: string
          p_user_id: string
          p_limit?: number
          p_before_id?: string
        }
        Returns: {
          message_id: string
          content: string
          sender_id: string
          sender_name: string
          sender_email: string
          sender_avatar_url: string
          created_at: string
          is_edited: boolean
          reactions: Json
          attachments: Json
        }[]
      }
      get_folder_contents: {
        Args: {
          p_folder_path?: string
          p_user_id?: string
          p_include_deleted?: boolean
        }
        Returns: {
          id: string
          name: string
          path: string
          type: string
          mime_type: string
          size_bytes: number
          uploaded_by: string
          created_at: string
          updated_at: string
          is_favorite: boolean
          is_shared: boolean
          tags: string[]
          uploader_name: string
          uploader_email: string
        }[]
      }
      get_locations_by_type: {
        Args: {
          loc_type: string
        }
        Returns: {
          id: string
          location_name: string
          full_address: string
          contact_info: string
        }[]
      }
      get_role_permissions: {
        Args: {
          user_role_type: string
        }
        Returns: {
          permission_name: string
          is_granted: boolean
          resource_type: string
        }[]
      }
      get_role_type_from_id: {
        Args: {
          role_id: string
        }
        Returns: string
      }
      get_shipping_rates: {
        Args: {
          p_subtotal_cents: number
          p_state?: string
        }
        Returns: {
          id: string
          name: string
          description: string
          carrier: string
          price_cents: number
          min_delivery_days: number
          max_delivery_days: number
        }[]
      }
      get_user_conversations: {
        Args: {
          p_user_id: string
          p_limit?: number
        }
        Returns: {
          channel_id: string
          channel_name: string
          is_group: boolean
          last_message: string
          last_message_at: string
          unread_count: number
        }[]
      }
      get_user_conversations_with_display_name: {
        Args: {
          p_user_id: string
          p_limit?: number
        }
        Returns: {
          channel_id: string
          channel_name: string
          channel_type: number
          is_group: boolean
          last_message_content: string
          last_message_at: string
          unread_count: number
          participants: Json
        }[]
      }
      get_user_permissions: {
        Args: {
          user_uuid: string
          user_role_type?: string
        }
        Returns: {
          permission_type: string
          resource_type: string
          permission_level: string
          specific_actions: string[]
          metadata: Json
        }[]
      }
      get_user_specializations: {
        Args: {
          user_uuid: string
        }
        Returns: {
          id: string
          name: string
          description: string
          role_id: string
          role_name: string
        }[]
      }
      increment_discount_uses: {
        Args: {
          p_code: string
        }
        Returns: undefined
      }
      is_channel_participant: {
        Args: {
          channel_uuid: string
          user_uuid: string
        }
        Returns: boolean
      }
      log_work_hours: {
        Args: {
          client_profile_id_param: string
          coach_profile_id_param: string
          work_date_param: string
          hours_param: number
          work_type_param?: string
          notes_param?: string
          hourly_rate_param?: number
        }
        Returns: string
      }
      move_document: {
        Args: {
          p_document_id: string
          p_new_path: string
          p_user_id: string
        }
        Returns: boolean
      }
      normalize_profile_role: {
        Args: {
          role_in: string
        }
        Returns: string
      }
      populate_dim_calendar: {
        Args: {
          start_date: string
          end_date: string
        }
        Returns: number
      }
      refresh_product_search_text: {
        Args: {
          p_product_id: string
        }
        Returns: undefined
      }
      release_discount_reservation: {
        Args: {
          p_reservation_id: string
        }
        Returns: undefined
      }
      remove_specialization: {
        Args: {
          target_user_id: string
          spec_id: string
        }
        Returns: boolean
      }
      request_creator_cashout: {
        Args: {
          p_creator_id: string
        }
        Returns: {
          admin_notes: string | null
          amount_cents: number
          creator_id: string
          failure_reason: string | null
          id: string
          requested_at: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
      }
      reserve_discount_use: {
        Args: {
          p_discount_id: string
          p_customer_key?: string
          p_hold_minutes?: number
        }
        Returns: string
      }
      resolve_creator_cashout: {
        Args: {
          p_cashout_id: string
          p_action: string
          p_failure_reason?: string
          p_admin_notes?: string
          p_resolved_by?: string
        }
        Returns: {
          admin_notes: string | null
          amount_cents: number
          creator_id: string
          failure_reason: string | null
          id: string
          requested_at: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
      }
      resolve_display_names: {
        Args: {
          user_ids: string[]
        }
        Returns: {
          id: string
          display_name: string
          email: string
        }[]
      }
      restore_document: {
        Args: {
          p_document_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      restore_profile: {
        Args: {
          p_profile_id: string
          p_actor_auth_user_id: string
        }
        Returns: undefined
      }
      reverse_creator_commission: {
        Args: {
          p_order_id: string
        }
        Returns: undefined
      }
      search_documents: {
        Args: {
          p_query: string
          p_user_id?: string
          p_folder_path?: string
          p_file_types?: string[]
          p_limit?: number
        }
        Returns: {
          id: string
          name: string
          path: string
          type: string
          mime_type: string
          size_bytes: number
          created_at: string
          snippet: string
          rank: number
        }[]
      }
      search_products: {
        Args: {
          q: string
          limit_count?: number
          offset_count?: number
        }
        Returns: {
          id: string
          slug: string
          title: string
          price_cents: number
          badge: string
          status: string
          is_featured: boolean
          created_at: string
          score: number
        }[]
      }
      send_message: {
        Args: {
          p_channel_id: string
          p_sender_id: string
          p_content: string
          p_attachment_url?: string
          p_attachment_type?: string
          p_attachment_name?: string
          p_attachment_size?: number
        }
        Returns: string
      }
      soft_delete_profile: {
        Args: {
          p_profile_id: string
          p_deleted_by_auth_user_id: string
          p_reason?: string
        }
        Returns: undefined
      }
      switch_active_environment: {
        Args: {
          target_id: string
        }
        Returns: {
          active: boolean
          agent_last_seen_at: string | null
          agent_port: number
          agent_status: string
          agent_token_secret_id: string | null
          agent_url: string
          agent_version: string
          azure_app_id_secret_id: string | null
          azure_auth_key_secret_id: string | null
          azure_tenant_id_secret_id: string | null
          created_at: string
          ddns_hostname: string
          docker_url: string
          domain: string
          id: string
          is_default_target: boolean
          machine_role: string
          name: string
          npm_host: string
          npm_port: number
          npm_secret_id: string | null
          proxy_host: string
          proxy_port: number
          public_url: string
          sort_order: number
          status: Database["public"]["Enums"]["environment_status"]
          tags: string[]
          tls_config: Json
          type: Database["public"]["Enums"]["environment_type"]
          updated_at: string
        }[]
      }
      tank_complete_mission: {
        Args: {
          p_user_id: string
          p_mission_title: string
        }
        Returns: Json
      }
      tank_level_for_xp: {
        Args: {
          xp_value: number
        }
        Returns: number
      }
      track_shared_cart_view: {
        Args: {
          p_share_token: string
          p_viewer_session_id: string
          p_ip_address?: unknown
          p_user_agent?: string
          p_referrer?: string
        }
        Returns: string
      }
      update_order_status: {
        Args: {
          p_order_id: string
          p_status: string
          p_tracking_number?: string
          p_tracking_url?: string
        }
        Returns: undefined
      }
      update_payment_status: {
        Args: {
          p_stripe_session_id: string
          p_payment_status: string
          p_stripe_payment_intent_id?: string
        }
        Returns: undefined
      }
      update_role_permission: {
        Args: {
          role_type_param: string
          permission_name_param: string
          is_granted_param: boolean
          resource_type_param?: string
        }
        Returns: boolean
      }
      upsert_guest_customer: {
        Args: {
          p_guest_key: string
          p_email: string
          p_first_name?: string
          p_last_name?: string
          p_phone?: string
          p_marketing?: boolean
        }
        Returns: string
      }
      user_has_specialization: {
        Args: {
          check_user_id: string
          spec_name: string
        }
        Returns: boolean
      }
      validate_theme_data: {
        Args: {
          theme_jsonb: Json
        }
        Returns: boolean
      }
    }
    Enums: {
      aal_level: "aal1" | "aal2" | "aal3"
      code_challenge_method: "s256" | "plain"
      environment_status: "up" | "down" | "unknown"
      environment_type: "local-docker" | "remote-docker" | "azure" | "edge"
      factor_status: "unverified" | "verified"
      factor_type: "totp" | "webauthn"
      one_time_token_type:
        | "confirmation_token"
        | "reauthentication_token"
        | "recovery_token"
        | "email_change_token_new"
        | "email_change_token_current"
        | "phone_change_token"
      zone_lifecycle_state: "active" | "missing" | "archived"
      zone_public_status:
        | "online"
        | "degraded"
        | "offline"
        | "unknown"
        | "stale"
      zone_visibility: "private" | "unlisted" | "public"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_insert_object: {
        Args: {
          bucketid: string
          name: string
          owner: string
          metadata: Json
        }
        Returns: undefined
      }
      extension: {
        Args: {
          name: string
        }
        Returns: string
      }
      filename: {
        Args: {
          name: string
        }
        Returns: string
      }
      foldername: {
        Args: {
          name: string
        }
        Returns: string[]
      }
      get_common_prefix: {
        Args: {
          p_key: string
          p_prefix: string
          p_delimiter: string
        }
        Returns: string
      }
      get_size_by_bucket: {
        Args: Record<PropertyKey, never>
        Returns: {
          size: number
          bucket_id: string
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          prefix_param: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
        }
        Returns: {
          key: string
          id: string
          created_at: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          prefix_param: string
          delimiter_param: string
          max_keys?: number
          start_after?: string
          next_token?: string
          sort_order?: string
        }
        Returns: {
          name: string
          id: string
          metadata: Json
          updated_at: string
          created_at: string
          last_accessed_at: string
        }[]
      }
      operation: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      search: {
        Args: {
          prefix: string
          bucketname: string
          limits?: number
          levels?: number
          offsets?: number
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          name: string
          id: string
          updated_at: string
          created_at: string
          last_accessed_at: string
          metadata: Json
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_prefix: string
          p_bucket_id: string
          p_limit: number
          p_level: number
          p_start_after: string
          p_sort_order: string
          p_sort_column: string
          p_sort_column_after: string
        }
        Returns: {
          key: string
          name: string
          id: string
          updated_at: string
          created_at: string
          last_accessed_at: string
          metadata: Json
        }[]
      }
      search_v2: {
        Args: {
          prefix: string
          bucket_name: string
          limits?: number
          levels?: number
          start_after?: string
          sort_order?: string
          sort_column?: string
          sort_column_after?: string
        }
        Returns: {
          key: string
          name: string
          id: string
          updated_at: string
          created_at: string
          last_accessed_at: string
          metadata: Json
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
