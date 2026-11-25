import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { Modal } from '../components/Modal';

type BackupInfo = { name: string; size: number; createdAt: string };

type DictInfo = {
  index: number;
  id: string;
  name: string;
  /** 用户自定义简称，空字符串表示未设置（界面显示「无」，查询页自动截断） */
  shortName: string;
  originalName: string;
  entryCount: number;
  mdxSize: number;
  mddSize: number;
  hasMdd: boolean;
  cssFiles: string[];
  jsFiles: string[];
  enabled: boolean;
};

type DictList = { root: string; exists: boolean; dicts: DictInfo[] };

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
  dictViewMode: 'filter' | 'list';
  dictPanelMode: 'drawer' | 'popup';
  dictFontScale: number;
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
  const [dictList, setDictList] = useState<DictList | null>(null);
  const [dictBusy, setDictBusy] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('ai');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  /** 右键词典名称后弹出的选择：修改名称或修改简称 */
  const [menuFor, setMenuFor] = useState<{ id: string; name: string } | null>(null);
  /** 已进入名称编辑模式的词典 */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** 已进入简称编辑模式的词典 */
  const [shortEditingId, setShortEditingId] = useState<string | null>(null);
  /** 字号滑动条的本地值，松手时才写入后端 */
  const [fontDraft, setFontDraft] = useState(100);

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
    setFontDraft(next.dictFontScale);
  }

  async function refreshBackups() {
    try {
      const result = await api.get<{ backups: BackupInfo[] }>('/backups');
      setBackups(result.backups);
    } catch {
      // 备份列表失败不影响其他功能
    }
  }

  async function refreshDicts() {
    try {
      setDictList(await api.get<DictList>('/dicts'));
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) });
    }
  }

  async function handleDictReload() {
    setDictBusy('reload');
    setNotice(null);
    try {
      const result = await api.post<{ count: number }>('/dicts/reload');
      setNotice({ kind: 'ok', text: `已重新扫描，共发现 ${result.count} 本词典` });
      await refreshDicts();
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) });
    } finally {
      setDictBusy(null);
    }
  }

  async function handleDictToggle(id: string, enabled: boolean) {
    setDictBusy(id);
    setNotice(null);
    try {
      await api.put(`/dicts/${encodeURIComponent(id)}`, { enabled });
      await refreshDicts();
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) });
    } finally {
      setDictBusy(null);
    }
  }

  async function renameDict(id: string, name: string, current: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === current) return;
    setDictBusy(id);
    setNotice(null);
    try {
      await api.put(`/dicts/${encodeURIComponent(id)}`, { name: trimmed });
      await refreshDicts();
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) });
      await refreshDicts();
    } finally {
      setDictBusy(null);
    }
  }

  /** 保存词典简称：空串表示清除，交回自动截断 */
  async function updateShortName(id: string, value: string, current: string) {
    const trimmed = value.trim().slice(0, 20);
    if (trimmed === current) return;
    setDictBusy(id);
    setNotice(null);
    try {
      await api.put(`/dicts/${encodeURIComponent(id)}`, { shortName: trimmed });
      await refreshDicts();
      setNotice({
        kind: 'ok',
        text: trimmed ? `简称已保存：${trimmed}` : '已清除简称，查询页显示为「无」',
      });
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) });
      await refreshDicts();
    } finally {
      setDictBusy(null);
    }
  }

  /** 切换单词查询面板的弹出方式（靠边抽屉 / 居中弹窗） */
  async function handlePanelModeChange(mode: 'drawer' | 'popup') {
    if (!settings || settings.dictPanelMode === mode) return;
    setDictBusy('panel');
    setNotice(null);
    try {
      const next = await api.put<PublicSettings>('/settings', { dictPanelMode: mode });
      applySettings(next);
      setNotice({ kind: 'ok', text: `查询面板已改为${mode === 'popup' ? '弹出显示' : '靠边显示'}` });
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) });
    } finally {
      setDictBusy(null);
    }
  }

  /** 保存词条字号（百分比，100 = 当前最小字号） */
  async function saveFontScale(value: number) {
    setFontDraft(value);
    if (!settings || settings.dictFontScale === value) return;
    setDictBusy('font');
    setNotice(null);
    try {
      const next = await api.put<PublicSettings>('/settings', { dictFontScale: value });
      applySettings(next);
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) });
    } finally {
      setDictBusy(null);
    }
  }

  /** 切换单词查询页的显示模式（即时生效，无需再点保存） */
  async function handleViewModeChange(mode: 'filter' | 'list') {
    if (!settings || settings.dictViewMode === mode) return;
    setDictBusy('view');
    setNotice(null);
    try {
      const next = await api.put<PublicSettings>('/settings', { dictViewMode: mode });
      applySettings(next);
      setNotice({ kind: 'ok', text: `已切换为${mode === 'filter' ? '筛选模式' : '列表模式'}` });
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) });
    } finally {
      setDictBusy(null);
    }
  }

  /** 拖拽排序：把 source 移到 target 的位置，并持久化新顺序 */  async function moveDict(sourceId: string, targetId: string) {
    if (!dictList || sourceId === targetId) return;
    const ids = dictList.dicts.map((dict) => dict.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;

    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, sourceId);

    // 先本地重排，避免界面闪烁；失败后回滚
    const byId = new Map(dictList.dicts.map((dict) => [dict.id, dict]));
    setDictList({
      ...dictList,
      dicts: next.map((id, index) => ({ ...(byId.get(id) as DictInfo), index: index + 1 })),
    });

    try {
      await api.put('/dicts/order', { ids: next });
      await refreshDicts();
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) });
      await refreshDicts();
    }
  }

  useEffect(() => {
    void refreshDicts();
  }, []);

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

  const sections = [
    { id: 'ai', label: 'AI 接口', meta: settings?.hasApiKey ? '已配置' : '未配置' },
    {
      id: 'dict',
      label: '字典管理',
      meta: dictList ? `${dictList.dicts.length} 本` : '读取中',
    },
    {
      id: 'view',
      label: '显示模式',
      meta: `${settings?.dictViewMode === 'list' ? '列表' : '筛选'} · ${
        settings?.dictPanelMode === 'popup' ? '弹出' : '靠边'
      }`,
    },
    { id: 'web', label: '例句联网核实', meta: form.enableSourceVerification ? '已开启' : '已关闭' },
    { id: 'export', label: '数据导出', meta: 'JSON / MD' },
    { id: 'backup', label: '备份与恢复', meta: `${backups.length} 个备份` },
  ];

  return (
    <div className="page settings-page">
      <div className="settings-layout">
        <aside className="settings-toc" aria-label="设置目录">
          {sections.map((section, index) => (
            <button
              key={section.id}
              type="button"
              className={`settings-toc-item ${activeSection === section.id ? 'is-active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              <span className="settings-toc-no">{index + 1}</span>
              <span className="settings-toc-text">
                <span className="settings-toc-label">{section.label}</span>
                <span className="settings-toc-meta">{section.meta}</span>
              </span>
            </button>
          ))}
        </aside>

        <div className="settings-panel">
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

      {activeSection === 'ai' && (
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">
              <span className="section-no">1</span>AI 接口
            </h2>
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
        </section>
      )}

      {activeSection === 'dict' && (
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">
              <span className="section-no">2</span>字典管理
            </h2>
            <span className="badge badge-neutral">
              {dictList
                ? `${dictList.dicts.length} 本 · ${dictList.dicts.filter((dict) => dict.enabled).length} 本启用`
                : '读取中…'}
            </span>
          </div>
          <div className="card-body stack">
          <p className="hint" style={{ margin: 0 }}>
            词典目录：<code className="mono">{dictList?.root ?? '…'}</code>
            （已加入 .gitignore，不会提交到版本库）。每本词典一个子目录，放入同名 .mdx / .mdd / .css / .js，
            放好后点「重新扫描」。
          </p>
          <div className="row">
            <button
              className="btn btn-sm"
              type="button"
              onClick={() => void handleDictReload()}
              disabled={dictBusy === 'reload'}
            >
              {dictBusy === 'reload' ? '扫描中…' : '重新扫描'}
            </button>
            {dictList && !dictList.exists && (
              <span className="small danger-text">目录不存在，请先创建并放入词典文件</span>
            )}
          </div>

          {!dictList ? (
            <div className="empty">读取词典列表…</div>
          ) : dictList.dicts.length === 0 ? (
            <div className="empty">还没有找到 .mdx 文件。</div>
          ) : (
            <table className="table dict-table">
              <thead>
                <tr>
                  <th className="dict-col-index">#</th>
                  <th>词典名称（右键修改）</th>
                  <th className="dict-col-short">简称</th>
                  <th className="dict-col-count">词条数</th>
                  <th className="dict-col-toggle">启用</th>
                </tr>
              </thead>
              <tbody>
                {dictList.dicts.map((dict) => (
                  <tr
                    key={dict.id}
                    className={`dict-row ${dragId === dict.id ? 'is-dragging' : ''} ${
                      dropId === dict.id && dragId && dragId !== dict.id ? 'is-drop-target' : ''
                    }`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      if (dropId !== dict.id) setDropId(dict.id);
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setDropId((previous) => (previous === dict.id ? null : previous));
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const source = event.dataTransfer.getData('text/plain') || dragId;
                      setDropId(null);
                      setDragId(null);
                      if (source) void moveDict(source, dict.id);
                    }}
                  >
                    <td
                      className="dict-col-index"
                      draggable
                      title="按住序号拖动可排序"
                      onDragStart={(event) => {
                        setDragId(dict.id);
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', dict.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setDropId(null);
                      }}
                    >
                      <span className="dict-grip">⋮⋮</span>
                      <span className="dict-index">{dict.index}</span>
                    </td>
                    <td>
                      {editingId === dict.id ? (
                        <input
                          autoFocus
                          className="input input-sm dict-name-input is-editing"
                          defaultValue={dict.name}
                          onBlur={(event) => {
                            const value = event.target.value;
                            setEditingId(null);
                            void renameDict(dict.id, value, dict.name);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur();
                            if (event.key === 'Escape') {
                              event.currentTarget.value = dict.name;
                              event.currentTarget.blur();
                            }
                          }}
                        />
                      ) : (
                        <span
                          className="dict-name-text"
                          title={
                            dict.originalName !== dict.name
                              ? `原名：${dict.originalName}（右键可修改名称或简称）`
                              : '右键可修改名称或简称'
                          }
                          onContextMenu={(event) => {
                            event.preventDefault();
                            setMenuFor({ id: dict.id, name: dict.name });
                          }}
                        >
                          {dict.name}
                        </span>
                      )}
                      <div className="mono small muted">{dict.id}</div>
                    </td>
                    <td className="dict-col-short">
                      {shortEditingId === dict.id ? (
                        <input
                          autoFocus
                          className="input input-sm dict-short-input"
                          defaultValue={dict.shortName}
                          maxLength={20}
                          placeholder="无"
                          title="单词查询页标签显示的文字；留空则自动取前两个词（中文取前两个字）"
                          onBlur={(event) => {
                            const value = event.target.value;
                            setShortEditingId(null);
                            void updateShortName(dict.id, value, dict.shortName);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur();
                            if (event.key === 'Escape') {
                              event.currentTarget.value = dict.shortName;
                              event.currentTarget.blur();
                            }
                          }}
                        />
                      ) : (
                        <span
                          className={`dict-short-text${dict.shortName ? '' : ' is-empty'}`}
                          title="右键上方词典名称可修改简称"
                        >
                          {dict.shortName || '无'}
                        </span>
                      )}
                    </td>
                    <td className="small dict-col-count">
                      {dict.entryCount > 0 ? `${dict.entryCount.toLocaleString('zh-CN')} 条` : '—'}
                    </td>
                    <td className="dict-col-toggle">
                      <input
                        type="checkbox"
                        checked={dict.enabled}
                        disabled={dictBusy === dict.id}
                        onChange={(event) => void handleDictToggle(dict.id, event.target.checked)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="hint" style={{ margin: 0 }}>
            词典查询完全离线，词条页面在 iframe 中按词典自带 CSS/JS 渲染；喇叭图标从 .mdd 取音频播放。
            在单词页双击单词标题即可打开查询面板「按住序号拖动可排序，右键名称可选择修改名称或简称」。
            「简称」用于查询页右侧的词典栏：未设置时显示为「无」，并按名称前两个单词（中文取前两个字）自动截断显示。
          </p>
        </div>
          {menuFor && (
            <Modal
              title="修改词典信息"
              onClose={() => setMenuFor(null)}
              footer={
                <>
                  <button className="btn" type="button" onClick={() => setMenuFor(null)}>
                    取消
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      setShortEditingId(menuFor.id);
                      setMenuFor(null);
                    }}
                  >
                    修改简称
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => {
                      setEditingId(menuFor.id);
                      setMenuFor(null);
                    }}
                  >
                    修改名称
                  </button>
                </>
              }
            >
              <p className="hint" style={{ margin: 0 }}>
                「{menuFor.name}」：请选择要修改的内容。确认后对应位置会变成输入框，按 Enter 保存，
                按 Esc 放弃。
              </p>
            </Modal>
          )}
        </section>
      )}

      {activeSection === 'view' && (
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">
              <span className="section-no">3</span>显示模式
            </h2>
            <span className="badge badge-neutral">
              {settings?.dictViewMode === 'list' ? '列表' : '筛选'} ·{' '}
              {settings?.dictPanelMode === 'popup' ? '弹出' : '靠边'}
            </span>
          </div>
          <div className="card-body stack">
            <p className="hint" style={{ margin: 0 }}>
              控制单词页双击标题弹出的词典查询面板。以下设置切换后立即生效，无需点保存。
            </p>

            <div className="mode-group">
              <h3 className="mode-group-title">面板位置</h3>
              <div className="mode-options">
                {[
                  {
                    id: 'drawer' as const,
                    title: '靠边显示',
                    desc: '面板贴右侧边缘全高展开，像抽屉一样滑出（默认）',
                    tag: '',
                  },
                  {
                    id: 'popup' as const,
                    title: '弹出显示',
                    desc: '面板居中弹出，四周留白并带遮罩，不贴边',
                    tag: '',
                  },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`mode-option ${settings?.dictPanelMode === option.id ? 'is-active' : ''}`}
                    disabled={dictBusy === 'panel'}
                    onClick={() => void handlePanelModeChange(option.id)}
                  >
                    <span className="mode-option-dot" />
                    <span className="mode-option-body">
                      <span className="mode-option-title">
                        {option.title}
                        {option.tag && <span className="badge badge-neutral">{option.tag}</span>}
                      </span>
                      <span className="mode-option-desc">{option.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mode-group">
              <h3 className="mode-group-title">词典内容组织</h3>
              <div className="mode-options">
                {[
                  {
                    id: 'filter' as const,
                    title: '筛选模式',
                    desc: '面板右侧竖向列出各词典编号，点击编号只看该词典的完整词条（默认）',
                    tag: '推荐',
                  },
                  {
                    id: 'list' as const,
                    title: '列表模式',
                    desc: '所有词典自上而下依次排列，每个词条可单独展开 / 折叠',
                    tag: '',
                  },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`mode-option ${settings?.dictViewMode === option.id ? 'is-active' : ''}`}
                    disabled={dictBusy === 'view'}
                    onClick={() => void handleViewModeChange(option.id)}
                  >
                    <span className="mode-option-dot" />
                    <span className="mode-option-body">
                      <span className="mode-option-title">
                        {option.title}
                        {option.tag && <span className="badge badge-neutral">{option.tag}</span>}
                      </span>
                      <span className="mode-option-desc">{option.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mode-group">
              <h3 className="mode-group-title">词条字号</h3>
              <div className="range-row">
                <input
                  id="dictFontScale"
                  className="range"
                  type="range"
                  min={100}
                  max={200}
                  step={5}
                  value={fontDraft}
                  aria-label="词条字号"
                  onChange={(event) => setFontDraft(Number(event.target.value))}
                  onPointerUp={(event) => void saveFontScale(Number(event.currentTarget.value))}
                  onKeyUp={(event) => void saveFontScale(Number(event.currentTarget.value))}
                />
                <span className="range-value">{fontDraft}%</span>
              </div>
              <div className="range-scale">
                <span>100%（最小 · 默认）</span>
                <span>150%</span>
                <span>200%</span>
              </div>
              <span className="hint">
                放大后词条正文（含音标、例句、图片）一起按比例缩放；已打开的面板需重新双击标题才会应用。
              </span>
            </div>

            <p className="hint" style={{ margin: 0 }}>
              词典编号旁的文字优先使用「字典管理」里配置的简称；未配置时自动取词典名称的前两个单词，
              中文名取前两个字，完整名称可在鼠标悬停时查看。
            </p>
          </div>
        </section>
      )}

      {activeSection === 'web' && (
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">
              <span className="section-no">4</span>例句联网核实
            </h2>
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
        </section>
      )}

      {activeSection === 'export' && (
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">
              <span className="section-no">5</span>数据导出
            </h2>
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
        </section>
      )}

      {activeSection === 'backup' && (
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">
              <span className="section-no">6</span>备份与恢复
            </h2>
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
        </section>
      )}
        </div>
      </div>
    </div>
  );
}
