-- ════════════════════════════════════════════════════════
--  CoachShift  完全スキーマ＋RLS設定
--  Supabase SQL Editor にそのまま貼り付けて実行
-- ════════════════════════════════════════════════════════

-- ─── 0. 拡張機能 ──────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── 1. coaches テーブル ──────────────────────────────
--  auth.users と 1:1 で紐付く。サインアップ後にトリガーで自動作成。
CREATE TABLE IF NOT EXISTS coaches (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  is_admin    boolean NOT NULL DEFAULT false,
  created_at  timestamp with time zone DEFAULT now()
);

-- サインアップ時に coaches 行を自動作成するトリガー
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.coaches (id, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'coach_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── 2. sub_requests テーブル ─────────────────────────
CREATE TABLE IF NOT EXISTS sub_requests (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_date  date NOT NULL,
  coach_name  text NOT NULL,
  status      text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'filled', 'closed')),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamp with time zone DEFAULT now()
);

-- ─── 3. sub_responses テーブル ────────────────────────
CREATE TABLE IF NOT EXISTS sub_responses (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id  uuid NOT NULL REFERENCES sub_requests(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name   text NOT NULL,
  choice      text NOT NULL CHECK (choice IN ('ok', 'maybe', 'ng')),
  created_at  timestamp with time zone DEFAULT now(),
  UNIQUE(request_id, user_id)   -- 1募集につき1人1回答
);

-- ─── 4. リアルタイム有効化 ────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE sub_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE sub_responses;

-- ════════════════════════════════════════════════════════
--  Row Level Security (RLS)
-- ════════════════════════════════════════════════════════

-- ─── coaches ──────────────────────────────────────────
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;

-- 自分のプロフィールは読める
CREATE POLICY "coaches: self read"
  ON coaches FOR SELECT
  USING (auth.uid() = id);

-- 管理者は全件読める
CREATE POLICY "coaches: admin read all"
  ON coaches FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM coaches WHERE id = auth.uid() AND is_admin = true)
  );

-- 自分の行のみ更新可
CREATE POLICY "coaches: self update"
  ON coaches FOR UPDATE
  USING (auth.uid() = id);

-- ─── sub_requests ─────────────────────────────────────
ALTER TABLE sub_requests ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは全件閲覧可
CREATE POLICY "requests: authenticated read"
  ON sub_requests FOR SELECT
  USING (auth.role() = 'authenticated');

-- 認証済みユーザーは作成可
CREATE POLICY "requests: authenticated insert"
  ON sub_requests FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- 管理者のみ更新・削除可
CREATE POLICY "requests: admin update"
  ON sub_requests FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM coaches WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "requests: admin delete"
  ON sub_requests FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM coaches WHERE id = auth.uid() AND is_admin = true)
  );

-- ─── sub_responses ────────────────────────────────────
ALTER TABLE sub_responses ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは全件閲覧可（誰が何と回答したか全員見える）
CREATE POLICY "responses: authenticated read"
  ON sub_responses FOR SELECT
  USING (auth.role() = 'authenticated');

-- 自分の回答のみ作成・更新可
CREATE POLICY "responses: self insert"
  ON sub_responses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "responses: self update"
  ON sub_responses FOR UPDATE
  USING (auth.uid() = user_id);

-- 自分の回答 or 管理者なら削除可
CREATE POLICY "responses: self or admin delete"
  ON sub_responses FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM coaches WHERE id = auth.uid() AND is_admin = true)
  );

-- ════════════════════════════════════════════════════════
--  初期管理者設定（メアドを自分のものに書き換えて実行）
-- ════════════════════════════════════════════════════════
-- UPDATE coaches
-- SET is_admin = true
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'your@email.com');
