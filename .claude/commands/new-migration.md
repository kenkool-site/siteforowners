Create a new Supabase migration file. The migration must:
1. Use the next sequential number (check existing files in supabase/migrations/)
2. Include CREATE TABLE with UUID primary key and created_at timestamp
3. Include tenant_id column if it's a client-data table
4. Include RLS policy: ALTER TABLE ... ENABLE ROW LEVEL SECURITY
5. Include SELECT/INSERT/UPDATE/DELETE policies scoped via tenant_members

Table name: $ARGUMENTS
