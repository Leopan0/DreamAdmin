/**
 * dream-admin 的浏览器侧：一个与「插件管理」同级的顶级面板 —— 记忆管理页。
 *
 * 注册方式与内置的插件管理页完全一致，两处：
 *   1. `ctx.slots.inject('main', ...)`：`main` 是 keyed 槽，用 `key: PANEL_ID`
 *      注册页面组件，页面由布局层按 `activePanelId` 选择渲染；
 *   2. `ctx.slots.inject('sidebar.panellist', ...)`：注册左侧栏的入口项。
 *
 * 这也是「管理页面放在插件管理同级、不在设置里」的落点 —— 走 `main` 槽，
 * 而不是 `settings.section`。
 *
 * 样式策略（与官方 dsh-web-ui-notify 一致）：`dream-admin.module.css` 只写
 * `--dsw-alias-*` / `--dsw-*` 宿主设计令牌，经 build-client.mjs 的 dsh-css 插件
 * 编译成哈希作用域的样式并在运行时注入；不定义任何自有颜色、不自造间距体系。
 *
 * @module dream-admin/client
 */
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import css from './dream-admin.module.css';

/** client half 的注入：`slots` 注册面板，`locale` 做双语文案。 */
export const inject = ['slots', 'locale'];

/** i18n 命名空间。 */
const NS = 'dream-admin';

/** 侧边栏入口 id 与 main 槽的 key，必须一致。 */
const PANEL_ID = 'dream-admin';

/** 接口前缀。 */
const API = '/dream-admin';

/** 中英文案。 */
const TXT = {
  zh: {
    panel: '记忆管理',
    title: 'DreamAdmin 记忆',
    workspace: '工作区',
    workspaceDefault: '（默认 / 当前工作区）',
    refresh: '刷新',
    new: '新建',
    search: '搜索记忆…',
    empty: '还没有记忆。点「新建」写一条，或在对话里让模型用 memory_save 记录。',
    noResult: '没有匹配的记忆。',
    mTitle: '标题',
    mTags: '标签（逗号分隔）',
    mBody: '正文（Markdown）',
    mPinned: '置顶（必定参与系统提示召回）',
    save: '保存',
    saving: '保存中…',
    del: '删除',
    confirmDelete: '确定删除这条记忆？此操作不可撤销。',
    created: '创建',
    updated: '更新',
    source: '来源',
    tabMemory: '记忆',
    tabSettings: '设置',
    back: '返回',
    listHint: '点一条记忆查看详情，或新建一条。',
    storeSection: '存储',
    storeDesc: '记忆放在哪里、以什么作用域管理',
    storeScope: '作用域',
    scopeWorkspace: '跟随工作区',
    scopeGlobal: '全局共用',
    storeScopeHintWorkspace: '每个工作区一份记忆，默认放在 <工作区>/memory。',
    storeScopeHintGlobal: '所有工作区共用一份记忆，默认放在 DSH 数据目录。',
    storePath: '记忆目录',
    storePathPlaceholder: '留空则使用默认目录',
    storePathHint: '填绝对路径可把记忆固定到任意目录；此时各工作区共用它。',
    effectivePath: '当前生效',
    useDefault: '恢复默认',
    recallSection: '自动带上记忆',
    recallDesc: '每次对话时，自动把记忆带给模型，让它记得你说过的事',
    recallEnabled: '每次对话自动带上记忆',
    recallLimit: '最多带上几条',
    recallMaxChars: '最多带多少字',
    recallUnlimited: '0 = 不限',
    dreamSection: '记忆梦境',
    dreamDesc:
      '开启后，模型会定期在后台整理、合并与更新记忆，像睡眠中的记忆巩固。' +
      '也可以随时在对话框输入 /memoryup 立即整理一次。',
    dreamEnabled: '开启记忆梦境',
    dreamOffHint: '记忆梦境已关闭（输入 /memoryup 仍可手动整理一次）。开启后才能选择供应商与模型。',
    dreamNeedModel:
      '已开启，但还没选择供应商和模型：自动入梦不会运行；输入 /memoryup 可以用当前对话模型立即整理一次。',
    dreamProvider: '模型提供商',
    dreamModel: '模型',
    dreamInterval: '入梦间隔',
    dreamMin: '最少记忆条数',
    unitMinutes: '分钟',
    unitItems: '条',
    unitChars: '字符',
    providerPlaceholder: '— 选择提供商 —',
    modelPlaceholder: '— 选择模型 —',
    custom: '（自定义）',
    runNow: '立即入梦',
    running: '入梦中…',
    evolveUpdated: '更新',
    evolveMerged: '合并',
    lastRun: '上次入梦',
    neverRun: '尚未入梦',
    runLog: '梦境记录',
    dreamReasonDisabled: '记忆梦境未开启。',
    dreamReasonModel: '未配置供应商或模型（对话框输入 /memoryup 可用当前对话模型）。',
    dreamReasonFew: '记忆条数不足，本次跳过。',
    dreamReasonBusy: '上一次梦境还没结束。',
    dreamReasonError: '调用模型失败。',
    dreamReasonParse: '模型输出无法解析。',
    statusDirty: '未保存',
    statusSaving: '保存中',
    statusSaved: '已保存',
    statusError: '保存失败',
    saved: '已保存。',
    saveFail: '保存失败：',
    loadFail: '加载失败：',
    needBody: '正文不能为空。',
  },
  en: {
    panel: 'Memory',
    title: 'DreamAdmin Memory',
    workspace: 'Workspace',
    workspaceDefault: '(default / active workspace)',
    refresh: 'Refresh',
    new: 'New',
    search: 'Search memories…',
    empty: 'No memories yet. Create one here, or let the model call memory_save in a conversation.',
    noResult: 'No matching memories.',
    mTitle: 'Title',
    mTags: 'Tags (comma separated)',
    mBody: 'Body (Markdown)',
    mPinned: 'Pinned (always included in prompt recall)',
    save: 'Save',
    saving: 'Saving…',
    del: 'Delete',
    confirmDelete: 'Delete this memory? This cannot be undone.',
    created: 'Created',
    updated: 'Updated',
    source: 'Source',
    tabMemory: 'Memories',
    tabSettings: 'Settings',
    back: 'Back',
    listHint: 'Open a memory for details, or create a new one.',
    storeSection: 'Storage',
    storeDesc: 'Where memories live and which scope they use',
    storeScope: 'Scope',
    scopeWorkspace: 'Follow workspace',
    scopeGlobal: 'Global store',
    storeScopeHintWorkspace: 'One store per workspace, default <workspace>/memory.',
    storeScopeHintGlobal: 'One store shared by every workspace, under the DSH data folder.',
    storePath: 'Memory folder',
    storePathPlaceholder: 'Leave empty for the default folder',
    storePathHint: 'An absolute path pins memories to that folder, shared by every workspace.',
    effectivePath: 'In effect',
    useDefault: 'Use default',
    recallSection: 'Auto memories',
    recallDesc: 'Memories are carried into every conversation automatically',
    recallEnabled: 'Carry memories into every conversation',
    recallLimit: 'Max memories each time',
    recallMaxChars: 'Max characters each time',
    recallUnlimited: '0 = unlimited',
    dreamSection: 'Memory dream',
    dreamDesc:
      'When on, a model periodically tidies, merges and updates memories in the background, like sleep-time consolidation. ' +
      'You can also run /memoryup in the composer to tidy once, right now.',
    dreamEnabled: 'Enable memory dream',
    dreamOffHint: 'Memory dream is off (you can still run /memoryup to tidy once). Turn it on to pick a provider and model.',
    dreamNeedModel:
      'Enabled, but no provider/model yet: automatic runs stay off. Run /memoryup to tidy once with the current conversation model.',
    dreamProvider: 'Provider',
    dreamModel: 'Model',
    dreamInterval: 'Interval',
    dreamMin: 'Minimum memories',
    unitMinutes: 'min',
    unitItems: 'items',
    unitChars: 'chars',
    providerPlaceholder: '— Select provider —',
    modelPlaceholder: '— Select model —',
    custom: ' (custom)',
    runNow: 'Dream now',
    running: 'Dreaming…',
    evolveUpdated: 'updated',
    evolveMerged: 'merged',
    lastRun: 'Last dream',
    neverRun: 'Never',
    runLog: 'Dream log',
    dreamReasonDisabled: 'Memory dream is off.',
    dreamReasonModel: 'No provider or model configured (run /memoryup to use the current conversation model).',
    dreamReasonFew: 'Not enough memories yet, skipped.',
    dreamReasonBusy: 'The previous dream is still running.',
    dreamReasonError: 'The model call failed.',
    dreamReasonParse: 'The model output could not be parsed.',
    statusDirty: 'Unsaved',
    statusSaving: 'Saving',
    statusSaved: 'Saved',
    statusError: 'Save failed',
    saved: 'Saved.',
    saveFail: 'Save failed: ',
    loadFail: 'Load failed: ',
    needBody: 'Body must not be empty.',
  },
};

/** 一条记忆的摘要（列表用）。 */
interface MemorySummary {
  id: string;
  title: string;
  tags: string[];
  created: string;
  updated: string;
  source: string;
  pinned: boolean;
  preview: string;
  file: string;
}

/** 一条完整记忆。 */
interface MemoryRecord extends MemorySummary {
  body: string;
}

/** 一个工作区候选。 */
interface WorkspaceRef {
  path: string;
  name: string;
  source: string;
}

/** 配置快照。 */
interface ConfigSnapshot {
  store: { dir: string; scope: 'workspace' | 'global' };
  recall: { enabled: boolean; limit: number; maxChars: number };
  evolve: {
    enabled: boolean;
    provider: string;
    model: string;
    intervalMinutes: number;
    minMemories: number;
    maxTokens: number;
    prompt: string;
  };
  root: string;
  configFile: string;
  /** 服务端解析出的默认值（用于「恢复默认」与占位提示）。 */
  defaults: { store: { dir: string; scope: 'workspace' | 'global' } };
}

/** provider / model 目录条目。 */
interface ProviderEntry {
  provider: string;
  name: string;
  models: Array<{ id: string; name: string }>;
}

/** 记忆梦境执行结果。 */
interface EvolveOutcome {
  ok: boolean;
  reason?: string;
  scanned: number;
  updated: number;
  merged: number;
  log: string;
}

/** 编辑器草稿。 */
interface Draft {
  id?: string;
  title: string;
  tags: string;
  body: string;
  pinned: boolean;
}

/** 空草稿。 */
const EMPTY_DRAFT: Draft = { title: '', tags: '', body: '', pinned: false };

/** 单个配置项的保存状态（驱动行内状态点）。 */
type ConfigState = 'dirty' | 'saving' | 'saved' | 'error';

/** 把工作区路径拼进请求。 */
function withWorkspace(path: string, workspace: string): string {
  if (workspace.length === 0) return path;
  return `${path}${path.includes('?') ? '&' : '?'}workspace=${encodeURIComponent(workspace)}`;
}

/** GET 一个 JSON 接口。 */
async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${await response.text().catch(() => '')}`);
  return (await response.json()) as T;
}

/** 侧边栏图标组件：由布局层传入 `size`。 */
function DreamAdminIcon({ size }: { size?: number }) {
  const edge = typeof size === 'number' ? size : 16;
  return (
    <svg
      width={edge}
      height={edge}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="5" width="14" height="14" rx="3" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <path d="M9 2.5v2.5M15 2.5v2.5M9 19v2.5M15 19v2.5M2.5 9H5M2.5 15H5M19 9h2.5M19 15h2.5" />
    </svg>
  );
}

/** 带单位的数字输入：本地即时更新，失焦或回车时提交。 */
function NumberField(props: {
  value: number;
  unit: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  onDirty?: () => void;
  onCommit: (value: number) => void;
}) {
  return (
    <span className={css.numberWrap}>
      <input
        className={`${css.input} ${css.inputNumber}`}
        type="number"
        min={props.min}
        max={props.max}
        value={props.value}
        disabled={props.disabled === true}
        onChange={(event) => {
          if (props.onDirty !== undefined) props.onDirty();
          props.onChange(Number(event.target.value));
        }}
        onBlur={(event) => props.onCommit(Number(event.target.value))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') props.onCommit(Number(event.currentTarget.value));
        }}
      />
      <span className={css.unit}>{props.unit}</span>
    </span>
  );
}

/** 开关：宿主的 track + thumb 结构，`aria-checked` 驱动样式（见 module.css）。 */
function Switch(props: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      className={css.switch}
      disabled={props.disabled === true}
      onClick={() => props.onChange(!props.checked)}
    >
      <span className={css.switchThumb} />
    </button>
  );
}

/** 服务端解析出的默认记忆目录名，用于判断「记忆目录」是否被自定义过。 */
function defaultStoreDir(snapshot: ConfigSnapshot): string {
  return snapshot.defaults?.store?.dir ?? 'memory';
}

/** 记忆梦境的跳过 / 失败原因码 → 本地化文案；未知码原样返回。 */
function dreamReasonText(t: (key: string) => string, reason: string | undefined): string {
  switch (reason) {
    case 'disabled':
      return t('dreamReasonDisabled');
    case 'model_not_configured':
      return t('dreamReasonModel');
    case 'too_few_memories':
      return t('dreamReasonFew');
    case 'busy':
      return t('dreamReasonBusy');
    case 'llm_error':
      return t('dreamReasonError');
    case 'unparsable':
      return t('dreamReasonParse');
    default:
      return reason ?? '';
  }
}

/** 记忆管理页面组件。 */
function MemoryPage(props: { t: (key: string) => string; root?: string }) {
  const t = props.t;

  const [workspaces, setWorkspaces] = useState<WorkspaceRef[]>([]);
  const [workspace, setWorkspace] = useState('');
  const [items, setItems] = useState<MemorySummary[]>([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [cfg, setCfg] = useState<ConfigSnapshot | null>(null);
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [evolveOutcome, setEvolveOutcome] = useState<EvolveOutcome | null>(null);
  const [rootPath, setRootPath] = useState('');
  const [view, setView] = useState<'memory' | 'settings'>('memory');
  const [cfgStatus, setCfgStatus] = useState<Record<string, ConfigState>>({});
  const [lastRunAt, setLastRunAt] = useState('');
  const [evolving, setEvolving] = useState(false);
  /** 「记忆目录」输入框的本地值；空串表示沿用默认目录。 */
  const [pathDraft, setPathDraft] = useState('');

  /** 拉取工作区候选。 */
  const loadWorkspaces = useCallback(async () => {
    try {
      const data = await getJson<{ items: WorkspaceRef[]; active: string }>(`${API}/workspaces`);
      setWorkspaces(data.items ?? []);
      setRootPath(data.active ?? '');
    } catch {
      // 工作区列表只是便利功能，失败不打断页面。
    }
  }, []);

  /** 拉取配置 + 模型目录。 */
  const loadConfig = useCallback(async () => {
    try {
      const [snapshot, list] = await Promise.all([
        getJson<ConfigSnapshot>(`${API}/config`),
        getJson<ProviderEntry[]>(`${API}/models`).catch(() => [] as ProviderEntry[]),
      ]);
      setCfg(snapshot);
      setRootPath(snapshot.root);
      setProviders(list ?? []);
      setPathDraft(snapshot.store.dir === defaultStoreDir(snapshot) ? '' : snapshot.store.dir);
    } catch (error) {
      setMsg({ ok: false, text: t('loadFail') + message(error) });
    }
  }, [t]);

  /** 拉取记忆列表。 */
  const loadList = useCallback(
    async (nextWorkspace: string, nextQuery: string) => {
      try {
        const q = nextQuery.trim();
        const url = withWorkspace(`${API}/memories?limit=500${q.length > 0 ? `&q=${encodeURIComponent(q)}` : ''}`, nextWorkspace);
        const data = await getJson<{ root: string; items: MemorySummary[] }>(url);
        setItems(data.items ?? []);
        setRootPath(data.root);
      } catch (error) {
        setMsg({ ok: false, text: t('loadFail') + message(error) });
      }
    },
    [t]
  );

  useEffect(() => {
    void loadWorkspaces();
    void loadConfig();
    void loadList('', '');
  }, [loadWorkspaces, loadConfig, loadList]);

  const refresh = useCallback(() => {
    setMsg(null);
    void loadWorkspaces();
    void loadConfig();
    void loadList(workspace, query);
  }, [loadConfig, loadList, loadWorkspaces, query, workspace]);

  /** 打开一条记忆进入编辑器。 */
  const openMemory = useCallback(
    async (id: string) => {
      try {
        const data = await getJson<{ memory: MemoryRecord | null }>(
          withWorkspace(`${API}/memory?id=${encodeURIComponent(id)}`, workspace)
        );
        const record = data.memory;
        if (record === null) {
          setMsg({ ok: false, text: t('loadFail') + id });
          return;
        }
        setDraft({
          id: record.id,
          title: record.title,
          tags: record.tags.join(', '),
          body: record.body,
          pinned: record.pinned,
        });
      } catch (error) {
        setMsg({ ok: false, text: t('loadFail') + message(error) });
      }
    },
    [t, workspace]
  );

  /** 保存草稿。 */
  const saveDraft = useCallback(async () => {
    if (draft === null) return;
    if (draft.body.trim().length === 0) {
      setMsg({ ok: false, text: t('needBody') });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const response = await fetch(`${API}/memory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: draft.id,
          workspace: workspace.length > 0 ? workspace : undefined,
          title: draft.title,
          tags: draft.tags,
          body: draft.body,
          pinned: draft.pinned,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; memory?: MemoryRecord; error?: string };
      if (!response.ok || data.ok !== true || data.memory === undefined) {
        throw new Error(data.error ?? String(response.status));
      }
      setDraft({
        id: data.memory.id,
        title: data.memory.title,
        tags: data.memory.tags.join(', '),
        body: data.memory.body,
        pinned: data.memory.pinned,
      });
      setMsg({ ok: true, text: t('saved') });
      await loadList(workspace, query);
    } catch (error) {
      setMsg({ ok: false, text: t('saveFail') + message(error) });
    } finally {
      setBusy(false);
    }
  }, [draft, loadList, query, t, workspace]);

  /** 删除当前记忆。 */
  const removeDraft = useCallback(async () => {
    if (draft?.id === undefined) return;
    if (!window.confirm(t('confirmDelete'))) return;
    setBusy(true);
    try {
      await fetch(withWorkspace(`${API}/memory?id=${encodeURIComponent(draft.id)}`, workspace), {
        method: 'DELETE',
      });
      setDraft(null);
      await loadList(workspace, query);
    } catch (error) {
      setMsg({ ok: false, text: t('saveFail') + message(error) });
    } finally {
      setBusy(false);
    }
  }, [draft, loadList, query, t, workspace]);

  /** 更新某个配置项的保存状态；传 null 清除。 */
  const setStatus = useCallback((key: string, state: ConfigState | null) => {
    setCfgStatus((prev) => {
      if (state === null) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: state };
    });
  }, []);

  /**
   * 保存配置：只把被改动的那一节用服务端回包覆盖，其余分节保留本地编辑，
   * 避免自动保存把用户正在输入的值冲掉；每个字段独立上报保存状态。
   */
  const commit = useCallback(
    async (key: string, section: 'store' | 'recall' | 'evolve', patch: Record<string, unknown>) => {
      setStatus(key, 'saving');
      try {
        const response = await fetch(`${API}/config`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const data = (await response.json()) as ConfigSnapshot & { ok?: boolean; error?: string };
        if (!response.ok) throw new Error(data.error ?? String(response.status));
        setCfg((prev) =>
          prev === null
            ? data
            : {
                ...prev,
                store: section === 'store' ? data.store : prev.store,
                recall: section === 'recall' ? data.recall : prev.recall,
                evolve: section === 'evolve' ? data.evolve : prev.evolve,
                root: data.root,
              }
        );
        setRootPath(data.root);
        setStatus(key, 'saved');
        window.setTimeout(() => setStatus(key, null), 1600);
        await loadList(workspace, query);
      } catch (error) {
        setStatus(key, 'error');
        setMsg({ ok: false, text: t('saveFail') + message(error) });
      }
    },
    [loadList, query, setStatus, t, workspace]
  );

  /** 默认记忆目录名（来自服务端解析的默认值）；savePath 的依赖数组要用到，故先声明。 */
  const defaultDir = cfg !== null ? defaultStoreDir(cfg) : 'memory';

  /** 保存「记忆目录」：空串表示恢复默认目录名。 */
  const savePath = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      const dir = trimmed.length > 0 ? trimmed : defaultDir;
      if (dir === cfg?.store.dir) {
        setStatus('store.path', null);
        return;
      }
      await commit('store.path', 'store', { store: { dir } });
    },
    [cfg?.store.dir, commit, defaultDir, setStatus]
  );

  /** 立即执行一次记忆梦境。 */
  const runEvolve = useCallback(async () => {
    setEvolving(true);
    setEvolveOutcome(null);
    setMsg(null);
    try {
      const response = await fetch(`${API}/evolve`, { method: 'POST' });
      const data = (await response.json()) as EvolveOutcome;
      setEvolveOutcome(data);
      setLastRunAt(new Date().toLocaleTimeString());
      await loadList(workspace, query);
    } catch (error) {
      setMsg({ ok: false, text: t('saveFail') + message(error) });
    } finally {
      setEvolving(false);
    }
  }, [loadList, query, t, workspace]);

  const availableModels = useMemo(
    () => providers.find((entry) => entry.provider === cfg?.evolve.provider)?.models ?? [],
    [providers, cfg?.evolve.provider]
  );

  const evolveReady = cfg !== null && cfg.evolve.provider.length > 0 && cfg.evolve.model.length > 0;
  const evolveOff = cfg === null || !cfg.evolve.enabled;

  /** 行内保存状态点；未改动时不占位。 */
  const dot = (key: string) => {
    const state = cfgStatus[key];
    if (state === undefined) return null;
    const suffix = `${state.charAt(0).toUpperCase()}${state.slice(1)}`;
    return (
      <span
        className={`${css.dot} ${css[`dot${suffix}`] ?? ''}`}
        title={t(`status${suffix}`)}
        aria-hidden="true"
      />
    );
  };

  /** 一行设置：左标签（可带说明），右控件 + 状态点。 */
  const row = (label: string, control: ReactNode, statusKey?: string, hint?: string) => (
    <div className={css.row}>
      <div className={css.rowText}>
        <span className={css.rowLabel}>{label}</span>
        {hint !== undefined ? <span className={css.rowHint}>{hint}</span> : null}
      </div>
      <div className={css.rowControl}>
        {control}
        {statusKey !== undefined ? dot(statusKey) : null}
      </div>
    </div>
  );

  return (
    <div className={css.page}>
      <header className={css.header}>
        <h2 className={css.title}>{t('title')}</h2>
        <nav className={css.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'memory'}
            className={view === 'memory' ? `${css.tab} ${css.tabActive}` : css.tab}
            onClick={() => setView('memory')}
          >
            {t('tabMemory')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'settings'}
            className={view === 'settings' ? `${css.tab} ${css.tabActive}` : css.tab}
            onClick={() => setView('settings')}
          >
            {t('tabSettings')}
          </button>
        </nav>
        <span className={css.spacer} />
        {view === 'memory' && draft === null ? (
          <>
            <span className={css.muted}>{t('workspace')}</span>
            <select
              className={css.select}
              value={workspace}
              onChange={(event) => {
                const next = event.target.value;
                setWorkspace(next);
                setDraft(null);
                void loadList(next, query);
              }}
            >
              <option value="">{t('workspaceDefault')}</option>
              {workspaces.map((entry) => (
                <option key={entry.path} value={entry.path}>
                  {entry.name} — {entry.path}
                </option>
              ))}
              {workspace.length > 0 && !workspaces.some((entry) => entry.path === workspace) ? (
                <option value={workspace}>{workspace}</option>
              ) : null}
            </select>
            <button type="button" className={`${css.btn} ${css.btnGhost}`} onClick={refresh}>
              {t('refresh')}
            </button>
          </>
        ) : null}
      </header>

      <div className={view === 'memory' ? css.body : css.hidden}>
        {draft === null ? (
          <>
            <div className={css.listHead}>
              <input
                className={`${css.input} ${css.search}`}
                placeholder={t('search')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void loadList(workspace, event.currentTarget.value);
                }}
              />
              <button
                type="button"
                className={`${css.btn} ${css.btnPrimary}`}
                onClick={() => {
                  setDraft({ ...EMPTY_DRAFT });
                  setMsg(null);
                }}
              >
                {t('new')}
              </button>
            </div>
            {items.length === 0 ? (
              <div className={css.empty}>{query.trim().length > 0 ? t('noResult') : t('empty')}</div>
            ) : (
              <div className={css.list}>
                <div className={css.listHint}>{t('listHint')}</div>
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={css.item}
                    onClick={() => void openMemory(item.id)}
                  >
                    <div className={css.itemTitle}>
                      {item.pinned ? '★ ' : ''}
                      {item.title}
                    </div>
                    <div className={css.itemMeta}>
                      {item.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className={css.tag}>
                          {tag}
                        </span>
                      ))}
                      <span className={css.itemPreview}>{item.preview}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className={css.detailHead}>
              <button
                type="button"
                className={`${css.btn} ${css.btnGhost}`}
                onClick={() => {
                  setDraft(null);
                  setMsg(null);
                }}
              >
                ← {t('back')}
              </button>
              <span className={css.detailTitle}>{draft.title.length > 0 ? draft.title : t('mTitle')}</span>
            </div>
            <div className={css.editorScroll}>
              <div className={css.field}>
                <label className={css.fieldLabel}>{t('mTitle')}</label>
                <input
                  className={css.input}
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                />
              </div>
              <div className={css.field}>
                <label className={css.fieldLabel}>{t('mTags')}</label>
                <input
                  className={css.input}
                  value={draft.tags}
                  onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
                />
              </div>
              <div className={css.field}>
                <label className={css.fieldLabel}>
                  <input
                    type="checkbox"
                    checked={draft.pinned}
                    onChange={(event) => setDraft({ ...draft, pinned: event.target.checked })}
                  />{' '}
                  {t('mPinned')}
                </label>
              </div>
              <div className={css.field}>
                <label className={css.fieldLabel}>{t('mBody')}</label>
                <textarea
                  className={css.textarea}
                  value={draft.body}
                  onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                />
              </div>
            </div>
            <div className={css.detailActions}>
              <button
                type="button"
                className={`${css.btn} ${css.btnPrimary}`}
                onClick={() => void saveDraft()}
                disabled={busy}
              >
                {busy ? t('saving') : t('save')}
              </button>
              {draft.id !== undefined ? (
                <button
                  type="button"
                  className={`${css.btn} ${css.btnDanger}`}
                  onClick={() => void removeDraft()}
                  disabled={busy}
                >
                  {t('del')}
                </button>
              ) : null}
              {draft.id !== undefined ? (
                <span className={css.detailId}>id: {draft.id}</span>
              ) : null}
            </div>
          </>
        )}
      </div>

      {view === 'settings' ? (
        <div className={css.settingsScroll}>
          {cfg === null ? (
            <div className={css.rowHint}>{t('loadFail')}</div>
          ) : (
            <div className={css.cards}>
              <section className={css.card}>
                <header className={css.cardHead}>
                  <h3 className={css.cardTitle}>{t('storeSection')}</h3>
                  <p className={css.cardDesc}>{t('storeDesc')}</p>
                </header>
                <div className={css.cardBody}>
                  {row(
                    t('storeScope'),
                    <select
                      className={css.select}
                      value={cfg.store.scope}
                      onChange={(event) => {
                        const scope = event.target.value as 'workspace' | 'global';
                        setCfg({ ...cfg, store: { ...cfg.store, scope } });
                        void commit('store.scope', 'store', { store: { scope } });
                      }}
                    >
                      <option value="workspace">{t('scopeWorkspace')}</option>
                      <option value="global">{t('scopeGlobal')}</option>
                    </select>,
                    'store.scope',
                    cfg.store.scope === 'global' ? t('storeScopeHintGlobal') : t('storeScopeHintWorkspace')
                  )}
                  {row(
                    t('storePath'),
                    <>
                      <input
                        className={`${css.input} ${css.inputPath}`}
                        value={pathDraft}
                        placeholder={t('storePathPlaceholder')}
                        spellCheck={false}
                        onChange={(event) => {
                          setStatus('store.path', 'dirty');
                          setPathDraft(event.target.value);
                        }}
                        onBlur={(event) => void savePath(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void savePath(event.currentTarget.value);
                        }}
                      />
                      {pathDraft.trim().length > 0 ? (
                        <button
                          type="button"
                          className={`${css.btn} ${css.btnGhost}`}
                          onClick={() => {
                            setPathDraft('');
                            void savePath('');
                          }}
                        >
                          {t('useDefault')}
                        </button>
                      ) : null}
                    </>,
                    'store.path',
                    t('storePathHint')
                  )}
                </div>
                <div className={css.pathText}>{`${t('effectivePath')}：${rootPath}`}</div>
              </section>

              <section className={css.card}>
                <header className={css.cardHead}>
                  <h3 className={css.cardTitle}>{t('recallSection')}</h3>
                  <p className={css.cardDesc}>{t('recallDesc')}</p>
                </header>
                <div className={css.cardBody}>
                  {row(
                    t('recallEnabled'),
                    <Switch
                      label={t('recallEnabled')}
                      checked={cfg.recall.enabled}
                      onChange={(next) => {
                        setCfg({ ...cfg, recall: { ...cfg.recall, enabled: next } });
                        void commit('recall.enabled', 'recall', { recall: { enabled: next } });
                      }}
                    />,
                    'recall.enabled'
                  )}
                  {row(
                    t('recallLimit'),
                    <NumberField
                      value={cfg.recall.limit}
                      min={0}
                      max={50}
                      unit={t('unitItems')}
                      onDirty={() => setStatus('recall.limit', 'dirty')}
                      onChange={(value) => setCfg({ ...cfg, recall: { ...cfg.recall, limit: value } })}
                      onCommit={(value) => void commit('recall.limit', 'recall', { recall: { limit: value } })}
                    />,
                    'recall.limit'
                  )}
                  {row(
                    t('recallMaxChars'),
                    <NumberField
                      value={cfg.recall.maxChars}
                      min={0}
                      unit={t('unitChars')}
                      onDirty={() => setStatus('recall.maxChars', 'dirty')}
                      onChange={(value) => setCfg({ ...cfg, recall: { ...cfg.recall, maxChars: value } })}
                      onCommit={(value) => void commit('recall.maxChars', 'recall', { recall: { maxChars: value } })}
                    />,
                    'recall.maxChars',
                    t('recallUnlimited')
                  )}
                </div>
              </section>

              <section className={css.card}>
                <header className={css.cardHead}>
                  <h3 className={css.cardTitle}>{t('dreamSection')}</h3>
                  <p className={css.cardDesc}>{t('dreamDesc')}</p>
                </header>
                <div className={css.cardBody}>
                  {row(
                    t('dreamEnabled'),
                    <Switch
                      label={t('dreamEnabled')}
                      checked={cfg.evolve.enabled}
                      onChange={(next) => {
                        setCfg({ ...cfg, evolve: { ...cfg.evolve, enabled: next } });
                        void commit('evolve.enabled', 'evolve', { evolve: { enabled: next } });
                      }}
                    />,
                    'evolve.enabled',
                    evolveOff ? t('dreamOffHint') : undefined
                  )}
                  {!evolveOff && !evolveReady ? <p className={css.offHint}>{t('dreamNeedModel')}</p> : null}
                  {row(
                    t('dreamProvider'),
                    <select
                      className={css.select}
                      value={cfg.evolve.provider}
                      disabled={evolveOff}
                      onChange={(event) => {
                        const provider = event.target.value;
                        const first = providers.find((entry) => entry.provider === provider)?.models[0]?.id ?? '';
                        setCfg({ ...cfg, evolve: { ...cfg.evolve, provider, model: first } });
                        void commit('evolve.provider', 'evolve', { evolve: { provider, model: first } });
                      }}
                    >
                      <option value="">{t('providerPlaceholder')}</option>
                      {providers.map((entry) => (
                        <option key={entry.provider} value={entry.provider}>
                          {entry.name || entry.provider}
                        </option>
                      ))}
                    </select>,
                    'evolve.provider'
                  )}
                  {row(
                    t('dreamModel'),
                    <select
                      className={css.select}
                      value={cfg.evolve.model}
                      disabled={evolveOff || cfg.evolve.provider.length === 0}
                      onChange={(event) => {
                        const model = event.target.value;
                        setCfg({ ...cfg, evolve: { ...cfg.evolve, model } });
                        void commit('evolve.model', 'evolve', { evolve: { model } });
                      }}
                    >
                      <option value="">{t('modelPlaceholder')}</option>
                      {availableModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name || model.id}
                        </option>
                      ))}
                      {cfg.evolve.model.length > 0 && !availableModels.some((entry) => entry.id === cfg.evolve.model) ? (
                        <option value={cfg.evolve.model}>{cfg.evolve.model + t('custom')}</option>
                      ) : null}
                    </select>,
                    'evolve.model'
                  )}
                  {row(
                    t('dreamInterval'),
                    <NumberField
                      value={cfg.evolve.intervalMinutes}
                      min={1}
                      max={1440}
                      unit={t('unitMinutes')}
                      disabled={evolveOff}
                      onDirty={() => setStatus('evolve.interval', 'dirty')}
                      onChange={(value) => setCfg({ ...cfg, evolve: { ...cfg.evolve, intervalMinutes: value } })}
                      onCommit={(value) => void commit('evolve.interval', 'evolve', { evolve: { intervalMinutes: value } })}
                    />,
                    'evolve.interval'
                  )}
                  {row(
                    t('dreamMin'),
                    <NumberField
                      value={cfg.evolve.minMemories}
                      min={1}
                      unit={t('unitItems')}
                      disabled={evolveOff}
                      onDirty={() => setStatus('evolve.min', 'dirty')}
                      onChange={(value) => setCfg({ ...cfg, evolve: { ...cfg.evolve, minMemories: value } })}
                      onCommit={(value) => void commit('evolve.min', 'evolve', { evolve: { minMemories: value } })}
                    />,
                    'evolve.min'
                  )}
                  <div className={css.cardActions}>
                    <button
                      type="button"
                      className={`${css.btn} ${css.btnPrimary}`}
                      onClick={() => void runEvolve()}
                      disabled={evolving || !evolveReady}
                      title={evolveReady ? undefined : t('dreamNeedModel')}
                    >
                      {evolving ? t('running') : t('runNow')}
                    </button>
                    <span className={css.rowHint}>
                      {`${t('lastRun')}: ${lastRunAt.length > 0 ? lastRunAt : t('neverRun')}`}
                    </span>
                    {evolveOutcome !== null ? (
                      <span className={evolveOutcome.ok ? css.ok : css.err}>
                        {evolveOutcome.ok
                          ? `${t('evolveUpdated')} ${evolveOutcome.updated} · ${t('evolveMerged')} ${evolveOutcome.merged}`
                          : dreamReasonText(t, evolveOutcome.reason)}
                      </span>
                    ) : null}
                  </div>
                  {evolveOutcome !== null ? (
                    <details>
                      <summary className={css.summary}>{t('runLog')}</summary>
                      <pre className={css.pre}>{evolveOutcome.log}</pre>
                    </details>
                  ) : null}
                </div>
              </section>
            </div>
          )}
        </div>
      ) : null}

      {msg !== null ? (
        <div className={css.statusBar}>
          <span className={msg.ok ? css.ok : css.err}>{msg.text}</span>
        </div>
      ) : null}
    </div>
  );
}

/** 提取错误信息。 */
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** client half 入口。 */
export function apply(ctx: Record<string, any>): void {
  try {
    if (ctx.locale && typeof ctx.locale.register === 'function') {
      ctx.locale.register(NS, TXT);
    }
    const t: (key: string) => string =
      ctx.locale && typeof ctx.locale.bind === 'function'
        ? ctx.locale.bind(NS)
        : (key: string) => (TXT.en as Record<string, string>)[key] ?? key;

    if (!ctx.slots || typeof ctx.slots.inject !== 'function') {
      console.warn('[dream-admin] slots 服务不可用，记忆管理页未注册');
      return;
    }

    // 顶级面板：main 是 keyed 槽，key 必须与 sidebar.panellist 的 id 一致。
    ctx.slots.inject('main', () =>
      ctx.slots.register(
        {
          name: 'main',
          key: PANEL_ID,
          locale: NS,
          inject: () => ({ t }),
        },
        MemoryPage
      )
    );

    // 左侧栏入口项。
    ctx.slots.inject('sidebar.panellist', () =>
      ctx.slots.register(
        {
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 30,
          locale: NS,
          label: () => t('panel'),
        },
        DreamAdminIcon
      )
    );
  } catch (error) {
    console.error('[dream-admin] 记忆管理页注册失败', error);
  }
}
