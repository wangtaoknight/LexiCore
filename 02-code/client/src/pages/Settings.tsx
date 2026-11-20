import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';

type BackupInfo = { name: string; size: number; createdAt: string };

type PublicSettings = {
  apiBaseUrl: string;
  apiKeyMasked: string | null;
  hasApiKey: boolean;
  model: string;
  temperature: number;
  maxTokens: number;
  thinking: 'enabled' | 'disabled';
  searchBaseUrl: string;
  enableSourceVerification: boolean;
  aiMode: 'live' | 'mock';
};

type FormState = {
  apiBaseUrl: string;
  model: string;
  apiKey: string;
  temperature: string;
  maxTokens: string;
  thinking: 'enabled' | 'disabled';
  searchBaseUrl: string;
  enableSourceVerification: boolean;
};

const EMPTY_FORM: FormState = {
  apiBaseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
  apiKey: '',
  temperature: '0.3',
  maxTokens: '8000',
  thinking: 'disabled',
  searchBaseUrl: 'https://api.deepseek.com',
  enableSourceVerification: false,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backingUp, setBackingUp] = useState(false);
  const [importing, setImporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function applySettings(next: PublicSettings) {
    setSettings(next);
    setForm({
      apiBaseUrl: next.apiBaseUrl,
      model: next.model,
      apiKey: '',
      temperature: String(next.temperature),
      maxTokens: String(next.maxTokens),
      thinking: next.thinking,
      searchBaseUrl: next.searchBaseUrl,
      enableSourceVerification: next.enableSourceVerification,
    });
  }

  async function refreshBackups() {
    try {
      const result = await api.get<{ backups: BackupInfo[] }>('/backups');
      setBackups(result.backups);
    } catch {
      // 备份列表失败不影响其他功能
    }
  }

  useEffect(() => {
    void refreshBackups();
  }, []);

  async function handleBackup() {
    setBackingUp(true);
    setNotice(null);
    try {
      const result = await api.post<{ backup: BackupInfo }>('/backup');
      setNotice({
        kind: 'ok',
        text: `已生成备份：${result.backup.name}（${(result.backup.size / 1024).toFixed(1)} KB）`,
      });
      await refreshBackups();
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) });
    } finally {
      setBackingUp(false);
    }
  }

  async function handleImportBacklog() {
    setImporting(true);
    setNotice(null);
    try {
      const result = await api.post<{ total: number; imported: number; skipped: number }>(
        '/backlog/import',
      );
      setNotice({
        kind: 'ok',
        text: `导入完成：新增 ${result.imported} 个待研究单词，跳过 ${result.skipped} 个（已存在或格式不符）`,
      });
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) });
    } finally {
      setImporting(false);
    }
  }

  async function handleRestore(file: File) {
    if (!window.confirm('恢复会覆盖当前数据库（恢复前会自动备份当前数据）。确定继续？')) return;
    setRestoring(true);
    setNotice(null);
    try {
      const response = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
      });
      const body = (await response.json()) as {
        ok?: boolean;
        preRestoreBackup?: string;
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(body.error?.message ?? `恢复失败（HTTP ${response.status}）`);
      }
      setNotice({
        kind: 'ok',
        text: `恢复成功。恢复前的数据已备份为 ${body.preRestoreBackup ?? '（未命名）'}，页面即将刷新。`,
      });
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) });
    } finally {
      setRestoring(false);
    }
  }
  useEffect(() => {
    api
      .get<PublicSettings>('/settings')
      .then(applySettings)
      .catch((error) => setNotice({ kind: 'error', text: errorMessage(error) }))
      .finally(() => setLoading(false));
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setNotice(null);
    try {
      const payload: Record<string, unknown> = {
        apiBaseUrl: form.apiBaseUrl.trim(),
        model: form.model.trim(),
        temperature: Number(form.temperature),
        maxTokens: Number(form.maxTokens),
        thinking: form.thinking,
        searchBaseUrl: form.searchBaseUrl.trim(),
        enableSourceVerification: form.enableSourceVerification,
      };
      if (form.apiKey.trim()) payload.apiKey = form.apiKey.trim();
      const next = await api.put<PublicSettings>('/settings', payload);
      applySettings(next);
      setNotice({ kind: 'ok', text: '配置已保存（API Key 仅保存在后端数据库，前端只显示掩码）' });
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function handleClearKey() {
    if (!window.confirm('确定要删除已保存的 API Key 吗？')) return;
    setSaving(true);
    setNotice(null);
    try {
      const next = await api.put<PublicSettings>('/settings', { clearApiKey: true });
      applySettings(next);
      setNotice({ kind: 'ok', text: 'API Key 已删除' });
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setNotice(null);
    try {
      const result = await api.post<{ ok: boolean; latencyMs: number; model?: string; reply?: string }>(
        '/settings/test',
      );
      setNotice({
        kind: 'ok',
        text: `连接成功：${result.model ?? '模型'}，耗时 ${result.latencyMs} ms，返回「${result.reply ?? ''}」`,
      });
    } catch (error) {
      setNotice({ kind: 'error', text: `连接失败：${errorMessage(error)}` });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <div className="empty">加载配置中…</div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">设置与数据</h1>
          <p className="page-desc">
            API Key 加密保存在本地数据库中，所有 AI 请求都经后端转发，不会出现在浏览器代码里。
          </p>
        </div>
      </div>

      {notice && (
        <div
          className={
            notice.kind === 'error'
              ? 'notice notice-error'
              : notice.kind === 'ok'
                ? 'notice notice-ok'
                : 'notice'
          }
          style={{ marginBottom: 16 }}
        >
          {notice.text}
        </div>
      )}

      {settings?.aiMode === 'mock' && (
        <div className="notice" style={{ marginBottom: 16 }}>
          当前为 mock 模式（AI_MODE=mock）：不会调用真实接口，使用内置样例数据。
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">AI 接口</h2>
          <span className="badge badge-neutral">
            {settings?.hasApiKey ? `已配置 ${settings.apiKeyMasked}` : '未配置 Key'}
          </span>
        </div>
        <div className="card-body stack">
          <div className="field">
            <label className="label" htmlFor="apiBaseUrl">
              API Base URL
            </label>
            <input
              id="apiBaseUrl"
              className="input"
              value={form.apiBaseUrl}
              onChange={(event) => update('apiBaseUrl', event.target.value)}
              placeholder="https://api.deepseek.com"
            />
            <span className="hint">兼容 OpenAI Chat Completions 协议；也可填以 /v1 结尾的地址。</span>
          </div>

          <div className="field">
            <label className="label" htmlFor="apiKey">
              API Key
            </label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input
                id="apiKey"
                className="input"
                type="password"
                value={form.apiKey}
                onChange={(event) => update('apiKey', event.target.value)}
                placeholder={settings?.hasApiKey ? '已保存，留空则不修改' : 'sk-...'}
                autoComplete="new-password"
              />
              {settings?.hasApiKey && (
                <button className="btn btn-danger" type="button" onClick={handleClearKey} disabled={saving}>
                  清除
                </button>
              )}
            </div>
            <span className="hint">保存后仅显示末四位，接口响应中不会返回明文。</span>
          </div>

          <div className="row">
            <div className="field" style={{ flex: 2, minWidth: 220 }}>
              <label className="label" htmlFor="model">
                模型名称
              </label>
              <input
                id="model"
                className="input"
                value={form.model}
                onChange={(event) => update('model', event.target.value)}
                placeholder="deepseek-flash"
              />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 110 }}>
              <label className="label" htmlFor="temperature">
                温度
              </label>
              <input
                id="temperature"
                className="input"
                value={form.temperature}
                onChange={(event) => update('temperature', event.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 120 }}>
              <label className="label" htmlFor="maxTokens">
                最大输出 tokens
              </label>
              <input
                id="maxTokens"
                className="input"
                value={form.maxTokens}
                onChange={(event) => update('maxTokens', event.target.value)}
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="field" style={{ maxWidth: 280 }}>
            <label className="label" htmlFor="thinking">
              思考模式
            </label>
            <select
              id="thinking"
              className="select"
              value={form.thinking}
              onChange={(event) => update('thinking', event.target.value as 'enabled' | 'disabled')}
            >
              <option value="disabled">关闭（推荐，结构化输出更稳更快）</option>
              <option value="enabled">开启（DeepSeek 深思）</option>
            </select>
          </div>

          <div className="row">
            <button className="btn btn-primary" type="button" onClick={handleSave} disabled={saving}>
              {saving ? '保存中…' : '保存配置'}
            </button>
            <button className="btn" type="button" onClick={handleTest} disabled={testing || !settings?.hasApiKey}>
              {testing ? '测试中…' : '测试连接'}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">例句联网核实</h2>
          <span className="badge badge-neutral">DeepSeek Search &amp; Fetch</span>
        </div>
        <div className="card-body stack">
          <label className="row" style={{ gap: 8 }}>
            <input
              type="checkbox"
              checked={form.enableSourceVerification}
              onChange={(event) => update('enableSourceVerification', event.target.checked)}
            />
            <span>允许在生成例句后联网检索原文，并在本地校验句子是否真实存在于来源页面</span>
          </label>
          <div className="field" style={{ maxWidth: 360 }}>
            <label className="label" htmlFor="searchBaseUrl">
              搜索服务 Base URL
            </label>
            <input
              id="searchBaseUrl"
              className="input"
              value={form.searchBaseUrl}
              onChange={(event) => update('searchBaseUrl', event.target.value)}
              placeholder="https://api.deepseek.com"
            />
            <span className="hint">使用与上相同的 API Key；非 DeepSeek 服务商不支持该能力。</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">数据导出</h2>
          <span className="badge badge-neutral">JSON / Markdown</span>
        </div>
        <div className="card-body stack">
          <p className="hint" style={{ margin: 0 }}>
            导出内容包含完整版本与审核记录，可用于长期备份或迁移到其他系统。
          </p>
          <div className="row">
            <a className="btn btn-sm" href="/api/export?scope=approved&format=json">
              导出已通过（JSON）
            </a>
            <a className="btn btn-sm" href="/api/export?scope=all&format=json">
              导出全部（JSON）
            </a>
            <a className="btn btn-sm" href="/api/export?scope=approved&format=md">
              导出已通过（Markdown）
            </a>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">备份与恢复</h2>
          <span className="badge badge-neutral">SQLite 单文件</span>
        </div>
        <div className="card-body stack">
          <div className="row">
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={() => void handleBackup()}
              disabled={backingUp}
            >
              {backingUp ? '备份中…' : '立即备份'}
            </button>
            <button
              className="btn btn-sm"
              type="button"
              onClick={() => void handleImportBacklog()}
              disabled={importing}
            >
              {importing ? '导入中…' : '导入 vocabulary copy.txt'}
            </button>
            <span className="hint">导入只建立待研究清单，不会调用 AI。</span>
          </div>

          {backups.length === 0 ? (
            <div className="empty">还没有备份文件。</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>文件</th>
                  <th>大小</th>
                  <th>时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((backup) => (
                  <tr key={backup.name}>
                    <td className="mono small">{backup.name}</td>
                    <td className="small">{(backup.size / 1024).toFixed(1)} KB</td>
                    <td className="small muted">
                      {new Date(backup.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td>
                      <a
                        className="btn btn-sm"
                        href={`/api/backup/download?name=${encodeURIComponent(backup.name)}`}
                      >
                        下载
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="divider" />

          <div className="field">
            <label className="label" htmlFor="restore-file">
              从备份文件恢复
            </label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input
                id="restore-file"
                ref={fileInputRef}
                type="file"
                accept=".db,application/octet-stream"
              />
              <button
                className="btn btn-danger btn-sm"
                type="button"
                disabled={restoring}
                onClick={() => {
                  const file = fileInputRef.current?.files?.[0];
                  if (!file) {
                    setNotice({ kind: 'error', text: '请先选择 .db 备份文件' });
                    return;
                  }
                  void handleRestore(file);
                }}
              >
                {restoring ? '恢复中…' : '上传并恢复'}
              </button>
            </div>
            <span className="hint">恢复前会自动把当前数据备份为 pre-restore-*.db。</span>
          </div>
        </div>
      </div>
    </div>
  );
}
