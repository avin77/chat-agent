
// src/core/db/schema.ts

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            customers: {
                Row: {
                    id: string
                    created_at: string
                    full_name: string
                    phone: string
                    address: string
                    house_details: Json
                    requirements: Json
                    status: string
                }
                Insert: {
                    id?: string
                    created_at?: string
                    full_name: string
                    phone: string
                    address?: string
                    house_details?: Json
                    requirements?: Json
                    status?: string
                }
                Update: {
                    full_name?: string
                    phone?: string
                    address?: string
                    house_details?: Json
                    requirements?: Json
                    status?: string
                }
            }
            helpers: {
                Row: {
                    id: string
                    created_at: string
                    full_name: string
                    phone: string
                    city: string
                    skills: string[]
                    status: string
                }
                Insert: {
                    id?: string
                    created_at?: string
                    full_name: string
                    phone: string
                    city: string
                    skills: string[]
                    status?: string
                }
            }
            tickets: {
                Row: {
                    id: string
                    created_at: string
                    user_type: 'customer' | 'helper'
                    user_id: string | null
                    phone: string
                    issue_description: string
                    sentiment: 'neutral' | 'angry'
                    status: 'open' | 'escalated' | 'closed'
                }
                Insert: {
                    user_type: 'customer' | 'helper'
                    user_id?: string | null
                    phone: string
                    issue_description: string
                    sentiment?: 'neutral' | 'angry'
                    status?: 'open' | 'escalated' | 'closed'
                }
            }
        }
    }
}
