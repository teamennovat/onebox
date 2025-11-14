export interface Database {
  public: {
    Tables: {
      user_mail_accounts: {
        Row: {
          id: string
          user_id: string
          nylas_account_id: string
          created_at?: string
          updated_at?: string
        }
        Insert: {
          id?: string
          user_id: string
          nylas_account_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          nylas_account_id?: string
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}