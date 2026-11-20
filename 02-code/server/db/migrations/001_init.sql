PRAGMA foreign_keys = ON;

-- 单词
CREATE TABLE words (
  id          TEXT PRIMARY KEY,
  lemma       TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'queued', -- queued(待研究) | studied(已生成概览)
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_words_status ON words(status);

-- 通用内容单元：单词基本信息、义项、概念解释、历史、例句、搭配、近义词、反义词
CREATE TABLE items (
  id              TEXT PRIMARY KEY,
  word_id         TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  parent_id       TEXT REFERENCES items(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,  -- word_basic | sense | sense_concept | sense_history | example | collocation | synonym | antonym
  seq             INTEGER NOT NULL DEFAULT 0,
  pos             TEXT,
  payload         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | reanalyzing
  evidence_type   TEXT NOT NULL DEFAULT 'ai_inferred', -- verified | sourced | ai_inferred | unverified
  origin          TEXT NOT NULL DEFAULT 'ai', -- ai | human
  current_version INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX idx_items_word ON items(word_id);
CREATE INDEX idx_items_parent ON items(parent_id);
CREATE INDEX idx_items_status ON items(status);
CREATE INDEX idx_items_kind ON items(kind);

-- 每一条内容的版本历史（AI 原稿永久保留为 version 1）
CREATE TABLE item_versions (
  id          TEXT PRIMARY KEY,
  item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  version_no  INTEGER NOT NULL,
  payload     TEXT NOT NULL,
  change_source TEXT NOT NULL, -- ai_initial | ai_revision | human_edit
  feedback    TEXT,
  note        TEXT,
  model       TEXT,
  ai_task_id  TEXT,
  created_at  TEXT NOT NULL,
  UNIQUE (item_id, version_no)
);
CREATE INDEX idx_item_versions_item ON item_versions(item_id);

-- 审核事件流水
CREATE TABLE review_events (
  id          TEXT PRIMARY KEY,
  item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  action      TEXT NOT NULL, -- approve | reject | edit | reanalyze_start | reanalyze_done | reanalyze_failed | unpublish
  from_status TEXT,
  to_status   TEXT,
  comment     TEXT,
  version_no  INTEGER,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_review_events_item ON review_events(item_id);

-- AI 调用日志（请求体已脱敏，不含 Authorization）
CREATE TABLE ai_tasks (
  id            TEXT PRIMARY KEY,
  word_id       TEXT REFERENCES words(id) ON DELETE CASCADE,
  item_id       TEXT,
  task_type     TEXT NOT NULL,
  request_json  TEXT NOT NULL,
  response_raw  TEXT,
  status        TEXT NOT NULL, -- running | succeeded | failed
  error         TEXT,
  model         TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  duration_ms   INTEGER,
  created_at    TEXT NOT NULL,
  finished_at   TEXT
);
CREATE INDEX idx_ai_tasks_word ON ai_tasks(word_id);

-- 配置（API Key 加密后存放）
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 预留：未来记忆训练相关字段，v1 不写入
CREATE TABLE learning_meta (
  item_id        TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  mastery        INTEGER,
  last_review_at TEXT,
  review_count   INTEGER NOT NULL DEFAULT 0,
  error_count    INTEGER NOT NULL DEFAULT 0,
  can_produce    INTEGER
);
