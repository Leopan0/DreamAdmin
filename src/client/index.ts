/**
 * dream-admin 的浏览器侧：一个与「插件管理」同级的顶级面板 —— 记忆管理页。
 *
 * 注册方式与内置的插件管理页完全一致，两处：
 *   1. `ctx.slots.inject('main', ...)`：`main` 是 keyed 槽，用 `key: PANEL_ID`
 *      注册页面组件，页面由布局层按 `activePanelId` 选择渲染；
 *   2. `ctx.slots.inject('sidebar.panellist', ...)`：注册左侧栏的入口项。
 *
 * 对话框命令是中文三条：`/记忆`、`/入梦`、`/取消`（`ctx.commandUi` 贡献项，action）。
 * `/记忆`、`/入梦` 先 POST 本插件的 HTTP 接口起一个长任务（`/dream-admin/capture`、
 * `/dream-admin/evolve`），再轮询 `GET /dream-admin/tasks` 上报阶段进度；`/取消` POST
 * `/dream-admin/cancel` 中断在跑的任务。状态与结果都通过会话输入框的 notify 通道显示。
 *
 * 为什么是客户端贡献项而不是宿主命令：DSH 的宿主命令名被硬编码成 ASCII
 * `[a-z][a-z0-9_-]*`（`dsh-commands` 的 `parseCommand`），中文根本写不进去；而客户端
 * 贡献项的 `name` 就是命令 token，按输入原文精确匹配（`/记忆`），是第三方提供中文
 * 命令唯一可行、且被官方支持的落点。
 *
 * 取舍：不注册宿主命令，`/` 菜单里就只剩这两条中文命令；代价是手动触发不再走宿主的
 * 「当前对话模型」回退（必须先在设置里为「整理记忆」「入梦」各选好 provider/model），
 * 结果也不再渲染成宿主流程节点，改为输入框上方的行内提示 / 错误 toast。
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
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    cmdCapture: '记忆',
    cmdCaptureDesc: '立即整理一次记忆：读取本工作区的历史会话，提炼成长期记忆',
    cmdDream: '入梦',
    cmdDreamDesc: '立即入梦一次：对已有记忆做合并 / 去重 / 提炼',
    cmdCancel: '取消',
    cmdCancelDesc: '中断正在进行的「整理记忆」或「入梦」',
    workspace: '工作区',
    workspaceEmpty: '（暂无工作区）',
    refresh: '刷新',
    new: '新建',
    search: '搜索记忆…',
    empty: '还没有记忆。点「新建」写一条，或开启「整理记忆」让模型从历史会话里提炼。',
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
    tabDreams: '梦境',
    back: '返回',
    listHint: '点一条记忆查看详情，或新建一条。',
    storeSection: '存储',
    storeDesc: '记忆按什么粒度分组存放',
    storeGroupBy: '分组方式',
    groupByWorkspace: '按工作区目录',
    groupByPeer: '按仓库身份共享',
    storeGroupByHintWorkspace: '每个工作区目录各一份记忆（<工作区>/memory）。',
    storeGroupByHintPeer: '同一仓库的多个 clone / worktree 共用一份记忆（放在 DSH 数据目录的 peers/<peer>/ 下）。',
    effectivePath: '当前生效',
    searchSection: '语义召回',
    searchDesc:
      '开启后，模型会把检索词扩写成同义 / 近义 / 中英文相关词，再融合进关键词检索，让「换个说法」也能命中。' +
      '与整理记忆、入梦一样，从 DSH 模型列表中选择供应商与模型；未开启或未选模型时只用关键词检索。',
    searchEnabled: '开启语义召回',
    searchOffHint: '语义召回已关闭（只用关键词 BM25）。开启后才能选择供应商与模型。',
    searchNeedModel: '已开启，但还没选择供应商和模型：检索仍只用关键词。',
    searchWeight: '扩写权重',
    peerLabel: '工作区身份',
    recallSection: '自动带上记忆',
    recallDesc: '每次对话时，自动把记忆带给模型，让它记得你说过的事',
    recallEnabled: '每次对话自动带上记忆',
    recallLimit: '最多带上几条',
    recallMaxChars: '最多带多少字',
    recallUnlimited: '0 = 不限',
    captureSection: '整理记忆',
    captureDesc:
      '开启后，模型会按间隔读取该工作区的历史会话（含已关闭的会话），把值得长期记住的事实提炼成记忆。' +
      '每个工作区各自整理。也可以随时在对话框输入 /记忆 立即整理一次。',
    captureEnabled: '开启整理记忆',
    captureOffHint: '整理记忆已关闭（自动定时不会运行）。输入 /记忆 仍可手动整理一次，但需要先在下方选好模型。',
    captureNeedModel:
      '已开启，但还没选择供应商和模型：自动整理不会运行，输入 /记忆 也无法整理，请先选择模型。',
    captureInterval: '整理间隔',
    captureMaxSessions: '最多会话数',
    captureMaxMessages: '每条会话消息数',
    captureMaxChars: '转录字符上限',
    runCapture: '立即整理',
    capturing: '整理中…',
    captureCreated: '新增',
    captureUpdated: '更新',
    lastCapture: '上次整理',
    neverCapture: '尚未整理',
    captureLog: '整理记录',
    captureReasonDisabled: '整理记忆未开启。',
    captureReasonModel: '未配置供应商或模型，请先在设置里选择。',
    captureReasonBusy: '上一次整理还没结束。',
    captureReasonNoSessions: '会话历史服务不可用，读不到历史会话。',
    captureReasonNoWorkspaces: '没有已知工作区。',
    captureReasonError: '调用模型失败。',
    captureReasonParse: '模型输出无法解析。',
    providerLabel: '模型提供商',
    modelLabel: '模型',
    dreamSection: '入梦',
    dreamDesc:
      '开启后，模型会在每天夜里到点合并、去重与改写已有记忆，像睡眠中的记忆巩固。' +
      '错过当日时刻不会补做，也可随时在对话框输入 /入梦 立即入梦一次。',
    dreamEnabled: '开启入梦',
    dreamOffHint: '入梦已关闭（自动定时不会运行）。输入 /入梦 仍可手动入梦一次，但需要先在下方选好模型。',
    dreamNeedModel:
      '已开启，但还没选择供应商和模型：自动入梦不会运行，输入 /入梦 也无法入梦，请先选择模型。',
    dreamHour: '夜间入梦时刻',
    dreamMin: '最少记忆条数',
    unitMinutes: '分钟',
    unitHour: '时',
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
    runLog: '明细',
    dreamHistoryEmpty: '暂无入梦记录。这个工作区还没入过梦。',
    dreamScanned: '扫描',
    dreamOk: '已完成',
    dreamReasonDisabled: '入梦未开启。',
    dreamReasonModel: '未配置供应商或模型，请先在设置里选择。',
    dreamReasonFew: '记忆条数不足，本次跳过。',
    dreamReasonBusy: '上一次入梦还没结束。',
    dreamReasonError: '调用模型失败。',
    dreamReasonParse: '模型输出无法解析。',
    taskPhasePrepare: '准备中…',
    taskPhaseScanDream: '读取记忆…',
    taskPhaseScanCapture: '读取历史会话…',
    taskPhaseModel: '调用模型中…',
    taskPhaseApply: '写入中…',
    taskCancel: '取消',
    taskCancelAll: '已请求取消',
    taskCancelled: '已取消。',
    taskNone: '没有正在进行的任务。',
    taskProgress: '处理进度',
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
    cmdCapture: 'Memory',
    cmdCaptureDesc: 'Capture memories now: read this workspace\u2019s past sessions and distill durable facts',
    cmdDream: 'Dream',
    cmdDreamDesc: 'Dream now: merge, de-duplicate and rewrite existing memories',
    cmdCancel: 'Cancel',
    cmdCancelDesc: 'Abort a running memory capture or dream',
    workspace: 'Workspace',
    workspaceEmpty: '(no workspace)',
    refresh: 'Refresh',
    new: 'New',
    search: 'Search memories…',
    empty: 'No memories yet. Create one here, or turn on "Capture memories" to distill them from past sessions.',
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
    tabDreams: 'Dreams',
    back: 'Back',
    listHint: 'Open a memory for details, or create a new one.',
    storeSection: 'Storage',
    storeDesc: 'How memories are grouped on disk',
    storeGroupBy: 'Grouping',
    groupByWorkspace: 'By workspace folder',
    groupByPeer: 'Share by repository',
    storeGroupByHintWorkspace: 'One memory store per workspace folder (<workspace>/memory).',
    storeGroupByHintPeer: 'Clones and worktrees of the same repository share one store (under the DSH data folder at peers/<peer>/).',
    effectivePath: 'In effect',
    searchSection: 'Semantic recall',
    searchDesc:
      'When on, the model rewrites your search terms into synonyms, near-synonyms and cross-language variants, ' +
      'then blends them into keyword search so paraphrases still match. Pick a provider and model from the DSH ' +
      'model list, just like capture and dream; without them, search stays keyword-only.',
    searchEnabled: 'Enable semantic recall',
    searchOffHint: 'Semantic recall is off (keyword BM25 only). Turn it on to pick a provider and model.',
    searchNeedModel: 'Enabled, but no provider/model yet: search stays keyword-only.',
    searchWeight: 'Rewrite weight',
    peerLabel: 'Workspace identity',
    recallSection: 'Auto memories',
    recallDesc: 'Memories are carried into every conversation automatically',
    recallEnabled: 'Carry memories into every conversation',
    recallLimit: 'Max memories each time',
    recallMaxChars: 'Max characters each time',
    recallUnlimited: '0 = unlimited',
    captureSection: 'Capture memories',
    captureDesc:
      'When on, a model periodically reads this workspace\u2019s past sessions (including closed ones) and distills ' +
      'facts worth keeping into memories. Each workspace is captured on its own. ' +
      'You can also run /记忆 in the composer to capture once, right now.',
    captureEnabled: 'Enable memory capture',
    captureOffHint:
      'Memory capture is off (automatic runs stay off). You can still run /记忆 to capture once, but pick a provider and model below first.',
    captureNeedModel:
      'Enabled, but no provider/model yet: automatic runs stay off, and /记忆 cannot run either. Pick a model first.',
    captureInterval: 'Interval',
    captureMaxSessions: 'Max sessions',
    captureMaxMessages: 'Messages per session',
    captureMaxChars: 'Transcript limit',
    runCapture: 'Capture now',
    capturing: 'Capturing…',
    captureCreated: 'created',
    captureUpdated: 'updated',
    lastCapture: 'Last capture',
    neverCapture: 'Never',
    captureLog: 'Capture log',
    captureReasonDisabled: 'Memory capture is off.',
    captureReasonModel: 'No provider or model configured; pick one in the settings first.',
    captureReasonBusy: 'The previous capture is still running.',
    captureReasonNoSessions: 'The session-history service is unavailable, so past sessions cannot be read.',
    captureReasonNoWorkspaces: 'No known workspace.',
    captureReasonError: 'The model call failed.',
    captureReasonParse: 'The model output could not be parsed.',
    providerLabel: 'Provider',
    modelLabel: 'Model',
    dreamSection: 'Dream',
    dreamDesc:
      'When on, a model merges, de-duplicates and rewrites existing memories once every night at the set hour, ' +
      'like sleep-time consolidation. Missed runs are not caught up; you can also run /入梦 in the composer any time.',
    dreamEnabled: 'Enable dream',
    dreamOffHint:
      'Dream is off (automatic runs stay off). You can still run /入梦 to dream once, but pick a provider and model below first.',
    dreamNeedModel:
      'Enabled, but no provider/model yet: automatic runs stay off, and /入梦 cannot run either. Pick a model first.',
    dreamHour: 'Nightly dream hour',
    dreamMin: 'Minimum memories',
    unitMinutes: 'min',
    unitHour: 'h',
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
    runLog: 'Details',
    dreamHistoryEmpty: 'No dream runs yet for this workspace.',
    dreamScanned: 'scanned',
    dreamOk: 'done',
    dreamReasonDisabled: 'Dream is off.',
    dreamReasonModel: 'No provider or model configured; pick one in the settings first.',
    dreamReasonFew: 'Not enough memories yet, skipped.',
    dreamReasonBusy: 'The previous dream is still running.',
    dreamReasonError: 'The model call failed.',
    dreamReasonParse: 'The model output could not be parsed.',
    taskPhasePrepare: 'Preparing…',
    taskPhaseScanDream: 'Reading memories…',
    taskPhaseScanCapture: 'Reading past sessions…',
    taskPhaseModel: 'Calling the model…',
    taskPhaseApply: 'Writing changes…',
    taskCancel: 'Cancel',
    taskCancelAll: 'Cancellation requested',
    taskCancelled: 'Cancelled.',
    taskNone: 'Nothing is running.',
    taskProgress: 'Progress',
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
  /** 一句话摘要；列表优先展示它。 */
  summary?: string;
  file: string;
  workspace?: string;
  /** 工作区逻辑身份；同一仓库的多个 clone / worktree 共用。 */
  peer?: string;
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
  /** 该工作区解析出的逻辑身份。 */
  peer?: string | null;
}

/** 配置快照。 */
interface ConfigSnapshot {
  store: { groupBy: 'workspace' | 'peer' };
  recall: { enabled: boolean; limit: number; maxChars: number };
  search: {
    semantic: boolean;
    provider: string;
    model: string;
    weight: number;
    maxTokens: number;
    prompt: string;
  };
  capture: {
    enabled: boolean;
    provider: string;
    model: string;
    intervalMinutes: number;
    maxSessions: number;
    maxMessages: number;
    maxChars: number;
    maxTokens: number;
    prompt: string;
  };
  evolve: {
    enabled: boolean;
    provider: string;
    model: string;
    atHour: number;
    minMemories: number;
    maxTokens: number;
    prompt: string;
  };
  root: string;
  configFile: string;
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

/** 一条落盘的入梦记录。 */
interface DreamRecord {
  at: string;
  workspace: string;
  ok: boolean;
  reason?: string;
  scanned: number;
  updated: number;
  merged: number;
  log: string;
  provider?: string;
  model?: string;
}

/** 整理记忆执行结果。 */
interface CaptureOutcome {
  ok: boolean;
  reason?: string;
  workspaces: number;
  sessions: number;
  created: number;
  updated: number;
  log: string;
}

/** 长任务种类。 */
type TaskKind = 'capture' | 'evolve';

/** 执行阶段（与服务端一致）。 */
type TaskPhase = 'prepare' | 'scan' | 'model' | 'apply';

/** 任务状态：`running` 时可取消。 */
type TaskStatus = 'running' | 'done' | 'cancelled';

/** 任务进度：工作区计数 + 阶段。 */
interface TaskProgress {
  phase: TaskPhase;
  completed: number;
  total: number;
  workspace?: string;
}

/** 长任务快照（服务端 `GET /tasks` 的形状）。 */
interface TaskSnapshot {
  id: string;
  kind: TaskKind;
  status: TaskStatus;
  startedAt: string;
  updatedAt: string;
  progress: TaskProgress;
  outcome?: EvolveOutcome | CaptureOutcome;
}

/** 编辑器草稿。 */
interface Draft {
  id?: string;
  title: string;
  tags: string;
  body: string;
  pinned: boolean;
  workspace?: string;
  /** 工作区逻辑身份（只读展示）。 */
  peer?: string;
}

/** 空草稿。 */
const EMPTY_DRAFT: Draft = { title: '', tags: '', body: '', pinned: false };

/** 单个配置项的保存状态（驱动行内状态点）。 */
type ConfigState = 'dirty' | 'saving' | 'saved' | 'error';

/** 取工作区路径的最后一段作为展示名。 */
function workspaceLabel(workspace: string): string {
  const parts = workspace.split(/[\\/]/).filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? workspace;
}

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

/** POST 一个 JSON 接口（无 body）。 */
async function postJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { method: 'POST' });
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

/** 取某个 provider 下的模型列表；provider 为空或不在目录里时返回空数组。 */
function modelsFor(providers: ProviderEntry[], provider: string): Array<{ id: string; name: string }> {
  return providers.find((entry) => entry.provider === provider)?.models ?? [];
}

/** provider 下拉：选项来自 DSH 模型目录。 */
function ProviderSelect(props: {
  value: string;
  disabled: boolean;
  placeholder: string;
  providers: ProviderEntry[];
  onChange: (provider: string) => void;
}) {
  return (
    <select
      className={css.select}
      value={props.value}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.value)}
    >
      <option value="">{props.placeholder}</option>
      {props.providers.map((entry) => (
        <option key={entry.provider} value={entry.provider}>
          {entry.name || entry.provider}
        </option>
      ))}
    </select>
  );
}

/** model 下拉：列出所选 provider 的模型；目录里没有的已存值以「自定义」保底。 */
function ModelSelect(props: {
  value: string;
  disabled: boolean;
  placeholder: string;
  customSuffix: string;
  models: Array<{ id: string; name: string }>;
  onChange: (model: string) => void;
}) {
  const known = props.models.some((entry) => entry.id === props.value);
  return (
    <select
      className={css.select}
      value={props.value}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.value)}
    >
      <option value="">{props.placeholder}</option>
      {props.models.map((model) => (
        <option key={model.id} value={model.id}>
          {model.name || model.id}
        </option>
      ))}
      {props.value.length > 0 && !known ? (
        <option value={props.value}>{props.value + props.customSuffix}</option>
      ) : null}
    </select>
  );
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
    case 'cancelled':
      return t('taskCancelled');
    default:
      return reason ?? '';
  }
}

/** 整理记忆的跳过 / 失败原因码 → 本地化文案；未知码原样返回。 */
function captureReasonText(t: (key: string) => string, reason: string | undefined): string {
  switch (reason) {
    case 'disabled':
      return t('captureReasonDisabled');
    case 'model_not_configured':
      return t('captureReasonModel');
    case 'busy':
      return t('captureReasonBusy');
    case 'no_sessions':
      return t('captureReasonNoSessions');
    case 'no_workspaces':
      return t('captureReasonNoWorkspaces');
    case 'llm_error':
      return t('captureReasonError');
    case 'unparsable':
      return t('captureReasonParse');
    case 'cancelled':
      return t('taskCancelled');
    default:
      return reason ?? '';
  }
}

/** 阶段码 → 本地化文案；`scan` 在两种任务里读的东西不同，分开措辞。 */
function phaseText(t: (key: string) => string, kind: TaskKind, phase: TaskPhase): string {
  switch (phase) {
    case 'prepare':
      return t('taskPhasePrepare');
    case 'scan':
      return kind === 'evolve' ? t('taskPhaseScanDream') : t('taskPhaseScanCapture');
    case 'model':
      return t('taskPhaseModel');
    case 'apply':
      return t('taskPhaseApply');
    default:
      return phase;
  }
}

/** 运行中任务 → 一行状态文案：阶段 + 第几个 / 共几个工作区。 */
function taskText(t: (key: string) => string, task: TaskSnapshot): string {
  const phase = phaseText(t, task.kind, task.progress.phase);
  const total = task.progress.total;
  if (total <= 0) return phase;
  const current = Math.min(total, task.progress.completed + 1);
  return `${phase} · ${current}/${total}`;
}

/** 进度条：`value` / `max` 都是工作区计数；`max` 未知（0）时走不确定态动画。 */
function ProgressBar(props: { value: number; max: number }) {
  const indeterminate = props.max <= 0;
  const ratio = indeterminate ? 0 : Math.min(1, Math.max(0, props.value / props.max));
  return (
    <div
      className={css.progress}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={indeterminate ? undefined : props.max}
      aria-valuenow={indeterminate ? undefined : props.value}
    >
      <div
        className={`${css.progressFill} ${indeterminate ? css.progressIndeterminate : ''}`}
        style={indeterminate ? undefined : { width: `${Math.round(ratio * 100)}%` }}
      />
    </div>
  );
}

/** 记忆管理页面组件。 */
function MemoryPage(props: { t: (key: string) => string; root?: string }) {
  const t = props.t;

  const [workspaces, setWorkspaces] = useState<WorkspaceRef[]>([]);
  const [workspace, setWorkspace] = useState('');
  const [items, setItems] = useState<MemorySummary[]>([]);
  const [dreams, setDreams] = useState<DreamRecord[]>([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [cfg, setCfg] = useState<ConfigSnapshot | null>(null);
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [evolveOutcome, setEvolveOutcome] = useState<EvolveOutcome | null>(null);
  const [captureOutcome, setCaptureOutcome] = useState<CaptureOutcome | null>(null);
  const [rootPath, setRootPath] = useState('');
  const [view, setView] = useState<'memory' | 'settings' | 'dreams'>('memory');
  const [cfgStatus, setCfgStatus] = useState<Record<string, ConfigState>>({});
  const [lastRunAt, setLastRunAt] = useState('');
  const [lastCaptureAt, setLastCaptureAt] = useState('');
  /** 长任务快照：进度条 / 取消按钮 / 恢复中的状态都从这里来。 */
  const [tasks, setTasks] = useState<TaskSnapshot[]>([]);
  /** 本次会话盯过的任务 id；只有它们结束时才回填结果，避免把历史任务当成本次结果。 */
  const watched = useRef<Set<string>>(new Set());

  /**
   * 拉取工作区候选（DSH 注册表优先）。
   * @returns 应默认选中的工作区路径：DSH 默认工作区优先，否则列表第一个；都没有时为空串。
   */
  const loadWorkspaces = useCallback(async (): Promise<string> => {
    try {
      const data = await getJson<{ items: WorkspaceRef[]; active: string; default?: string }>(
        `${API}/workspaces`
      );
      const items = data.items ?? [];
      setWorkspaces(items);
      setRootPath(data.active ?? '');
      const preferred = typeof data.default === 'string' ? data.default : '';
      return preferred.length > 0 ? preferred : (items[0]?.path ?? '');
    } catch {
      // 工作区列表只是便利功能，失败不打断页面。
      return '';
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

  /** 拉取当前工作区的入梦记录。 */
  const loadDreams = useCallback(async () => {
    try {
      const data = await getJson<{ root: string; items: DreamRecord[] }>(
        withWorkspace(`${API}/evolve-history?limit=100`, workspace)
      );
      setDreams(data.items ?? []);
    } catch {
      // 入梦记录只是展示，失败不打断页面。
    }
  }, [workspace]);

  /** 拉取长任务快照（新的在前）。 */
  const loadTasks = useCallback(async () => {
    try {
      const data = await getJson<{ items: TaskSnapshot[] }>(`${API}/tasks`);
      setTasks(data.items ?? []);
    } catch {
      // 进度只是展示，失败不打断页面。
    }
  }, []);

  /** 请求取消一个任务；服务端会在下一个阶段边界停下。 */
  const cancelTask = useCallback(
    async (id: string) => {
      try {
        await postJson<{ ok: boolean }>(`${API}/cancel?id=${encodeURIComponent(id)}`);
      } catch (error) {
        setMsg({ ok: false, text: message(error) });
      } finally {
        await loadTasks();
      }
    },
    [loadTasks]
  );

  // 打开面板：默认落在 DSH 的默认工作区（而不是跟着当前会话跑），下拉里再列全
  // DSH 展示的所有工作区供切换。
  useEffect(() => {
    let disposed = false;
    void (async () => {
      const initial = await loadWorkspaces();
      if (disposed) return;
      setWorkspace(initial);
      void loadConfig();
      void loadList(initial, '');
      // 恢复可能在刷新前就已经启动的任务（例如从对话框命令发起的）。
      void loadTasks();
    })();
    return () => {
      disposed = true;
    };
  }, [loadWorkspaces, loadConfig, loadList, loadTasks]);

  // 切换工作区时重新拉取该工作区的入梦记录。
  useEffect(() => {
    void loadDreams();
  }, [loadDreams]);

  // 有任务在跑时轮询进度；任务全部结束就自动停表。
  const anyTaskRunning = tasks.some((task) => task.status === 'running');
  useEffect(() => {
    if (!anyTaskRunning) return;
    const timer = window.setInterval(() => void loadTasks(), 1000);
    return () => window.clearInterval(timer);
  }, [anyTaskRunning, loadTasks]);

  // 任务到达终态：回填结果并刷新列表 / 入梦记录；每个任务只处理一次。
  useEffect(() => {
    for (const task of tasks) {
      if (task.status === 'running') {
        watched.current.add(task.id);
        continue;
      }
      if (!watched.current.has(task.id)) continue;
      watched.current.delete(task.id);
      if (task.kind === 'evolve') {
        if (task.outcome !== undefined) setEvolveOutcome(task.outcome as EvolveOutcome);
        setLastRunAt(new Date(task.updatedAt).toLocaleTimeString());
        void loadDreams();
      } else {
        if (task.outcome !== undefined) setCaptureOutcome(task.outcome as CaptureOutcome);
        setLastCaptureAt(new Date(task.updatedAt).toLocaleTimeString());
      }
      void loadList(workspace, query);
    }
  }, [tasks, loadDreams, loadList, query, workspace]);

  const refresh = useCallback(() => {
    setMsg(null);
    void loadWorkspaces();
    void loadConfig();
    void loadList(workspace, query);
    void loadDreams();
    void loadTasks();
  }, [loadConfig, loadDreams, loadList, loadTasks, loadWorkspaces, query, workspace]);

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
          workspace: record.workspace,
          peer: record.peer,
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
        workspace: data.memory.workspace,
        peer: data.memory.peer,
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
    async (
      key: string,
      section: 'store' | 'recall' | 'search' | 'capture' | 'evolve',
      patch: Record<string, unknown>
    ) => {
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
                search: section === 'search' ? data.search : prev.search,
                capture: section === 'capture' ? data.capture : prev.capture,
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

  /** 立即执行一次记忆梦境：只负责起任务，进度与结果由轮询驱动。 */
  const runEvolve = useCallback(async () => {
    setEvolveOutcome(null);
    setMsg(null);
    try {
      const data = await postJson<{ taskId?: string }>(withWorkspace(`${API}/evolve`, workspace));
      if (data.taskId !== undefined) watched.current.add(data.taskId);
      await loadTasks();
    } catch (error) {
      setMsg({ ok: false, text: t('saveFail') + message(error) });
    }
  }, [loadTasks, t, workspace]);

  /** 立即整理一次记忆（读历史会话）：同样只负责起任务。 */
  const runCapture = useCallback(async () => {
    setCaptureOutcome(null);
    setMsg(null);
    try {
      const data = await postJson<{ taskId?: string }>(withWorkspace(`${API}/capture`, workspace));
      if (data.taskId !== undefined) watched.current.add(data.taskId);
      await loadTasks();
    } catch (error) {
      setMsg({ ok: false, text: t('saveFail') + message(error) });
    }
  }, [loadTasks, t, workspace]);

  const availableModels = useMemo(
    () => modelsFor(providers, cfg?.evolve.provider ?? ''),
    [providers, cfg?.evolve.provider]
  );

  const availableCaptureModels = useMemo(
    () => modelsFor(providers, cfg?.capture.provider ?? ''),
    [providers, cfg?.capture.provider]
  );

  const availableSearchModels = useMemo(
    () => modelsFor(providers, cfg?.search.provider ?? ''),
    [providers, cfg?.search.provider]
  );

  /** 正在跑的入梦 / 整理记忆任务；有则在卡片里显示进度条与「取消」。 */
  const evolveTask = tasks.find((task) => task.kind === 'evolve' && task.status === 'running');
  const captureTask = tasks.find((task) => task.kind === 'capture' && task.status === 'running');
  const evolving = evolveTask !== undefined;
  const capturing = captureTask !== undefined;

  const evolveReady = cfg !== null && cfg.evolve.provider.length > 0 && cfg.evolve.model.length > 0;
  const evolveOff = cfg === null || !cfg.evolve.enabled;

  const captureReady = cfg !== null && cfg.capture.provider.length > 0 && cfg.capture.model.length > 0;
  const captureOff = cfg === null || !cfg.capture.enabled;

  const searchReady = cfg !== null && cfg.search.provider.length > 0 && cfg.search.model.length > 0;
  const searchOff = cfg === null || !cfg.search.semantic;

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
            aria-selected={view === 'dreams'}
            className={view === 'dreams' ? `${css.tab} ${css.tabActive}` : css.tab}
            onClick={() => setView('dreams')}
          >
            {t('tabDreams')}
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
        {(view === 'memory' && draft === null) || view === 'dreams' ? (
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
              {workspaces.length === 0 ? <option value="">{t('workspaceEmpty')}</option> : null}
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
                      {item.workspace !== undefined ? (
                        <span className={css.tag} title={item.workspace}>
                          {workspaceLabel(item.workspace)}
                        </span>
                      ) : item.peer !== undefined ? (
                        <span className={css.tag} title={item.peer}>
                          {item.peer}
                        </span>
                      ) : null}
                      {item.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className={css.tag}>
                          {tag}
                        </span>
                      ))}
                      <span className={css.itemPreview}>{item.summary ?? item.preview}</span>
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
              {draft.workspace !== undefined ? (
                <span className={css.detailId} title={draft.workspace}>
                  {t('workspace')}: {workspaceLabel(draft.workspace)}
                </span>
              ) : null}
              {draft.peer !== undefined ? (
                <span className={css.detailId} title={draft.peer}>
                  {t('peerLabel')}: {draft.peer}
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>

      <div className={view === 'dreams' ? css.body : css.hidden}>
        {dreams.length === 0 ? (
          <div className={css.empty}>{t('dreamHistoryEmpty')}</div>
        ) : (
          <div className={css.list}>
            {dreams.map((rec, index) => (
              <div className={css.item} key={`${rec.at}-${index}`}>
                <div className={css.itemTitle}>
                  {`${new Date(rec.at).toLocaleString()} · ${workspaceLabel(rec.workspace)}`}
                </div>
                <div className={css.itemMeta}>
                  <span className={css.tag}>
                    {rec.ok ? t('dreamOk') : dreamReasonText(t, rec.reason)}
                  </span>
                  <span className={css.itemPreview}>
                    {`${t('evolveUpdated')} ${rec.updated} · ${t('evolveMerged')} ${rec.merged} · ${t('dreamScanned')} ${rec.scanned}`}
                  </span>
                </div>
                <details>
                  <summary className={css.summary}>{t('runLog')}</summary>
                  <pre className={css.pre}>{rec.log}</pre>
                </details>
              </div>
            ))}
          </div>
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
                    t('storeGroupBy'),
                    <select
                      className={css.select}
                      value={cfg.store.groupBy}
                      onChange={(event) => {
                        const groupBy = event.target.value as 'workspace' | 'peer';
                        setCfg({ ...cfg, store: { ...cfg.store, groupBy } });
                        void commit('store.groupBy', 'store', { store: { groupBy } });
                      }}
                    >
                      <option value="workspace">{t('groupByWorkspace')}</option>
                      <option value="peer">{t('groupByPeer')}</option>
                    </select>,
                    'store.groupBy',
                    cfg.store.groupBy === 'peer' ? t('storeGroupByHintPeer') : t('storeGroupByHintWorkspace')
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
                  <h3 className={css.cardTitle}>{t('searchSection')}</h3>
                  <p className={css.cardDesc}>{t('searchDesc')}</p>
                </header>
                <div className={css.cardBody}>
                  {row(
                    t('searchEnabled'),
                    <Switch
                      label={t('searchEnabled')}
                      checked={cfg.search.semantic}
                      onChange={(next) => {
                        setCfg({ ...cfg, search: { ...cfg.search, semantic: next } });
                        void commit('search.semantic', 'search', { search: { semantic: next } });
                      }}
                    />,
                    'search.semantic',
                    searchOff ? t('searchOffHint') : undefined
                  )}
                  {!searchOff && !searchReady ? <p className={css.offHint}>{t('searchNeedModel')}</p> : null}
                  {row(
                    t('providerLabel'),
                    <ProviderSelect
                      value={cfg.search.provider}
                      disabled={searchOff}
                      placeholder={t('providerPlaceholder')}
                      providers={providers}
                      onChange={(provider) => {
                        const first = modelsFor(providers, provider)[0]?.id ?? '';
                        setCfg({ ...cfg, search: { ...cfg.search, provider, model: first } });
                        void commit('search.provider', 'search', { search: { provider, model: first } });
                      }}
                    />,
                    'search.provider'
                  )}
                  {row(
                    t('modelLabel'),
                    <ModelSelect
                      value={cfg.search.model}
                      disabled={searchOff || cfg.search.provider.length === 0}
                      placeholder={t('modelPlaceholder')}
                      customSuffix={t('custom')}
                      models={availableSearchModels}
                      onChange={(model) => {
                        setCfg({ ...cfg, search: { ...cfg.search, model } });
                        void commit('search.model', 'search', { search: { model } });
                      }}
                    />,
                    'search.model'
                  )}
                  {row(
                    t('searchWeight'),
                    <input
                      className={`${css.input} ${css.inputNumber}`}
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={cfg.search.weight}
                      disabled={searchOff}
                      onChange={(event) => {
                        setStatus('search.weight', 'dirty');
                        setCfg({ ...cfg, search: { ...cfg.search, weight: Number(event.target.value) } });
                      }}
                      onBlur={(event) =>
                        void commit('search.weight', 'search', { search: { weight: Number(event.target.value) } })
                      }
                    />,
                    'search.weight'
                  )}
                </div>
              </section>

              <section className={css.card}>
                <header className={css.cardHead}>
                  <h3 className={css.cardTitle}>{t('captureSection')}</h3>
                  <p className={css.cardDesc}>{t('captureDesc')}</p>
                </header>
                <div className={css.cardBody}>
                  {row(
                    t('captureEnabled'),
                    <Switch
                      label={t('captureEnabled')}
                      checked={cfg.capture.enabled}
                      onChange={(next) => {
                        setCfg({ ...cfg, capture: { ...cfg.capture, enabled: next } });
                        void commit('capture.enabled', 'capture', { capture: { enabled: next } });
                      }}
                    />,
                    'capture.enabled',
                    captureOff ? t('captureOffHint') : undefined
                  )}
                  {!captureOff && !captureReady ? <p className={css.offHint}>{t('captureNeedModel')}</p> : null}
                  {row(
                    t('providerLabel'),
                    <ProviderSelect
                      value={cfg.capture.provider}
                      disabled={captureOff}
                      placeholder={t('providerPlaceholder')}
                      providers={providers}
                      onChange={(provider) => {
                        const first = modelsFor(providers, provider)[0]?.id ?? '';
                        setCfg({ ...cfg, capture: { ...cfg.capture, provider, model: first } });
                        void commit('capture.provider', 'capture', { capture: { provider, model: first } });
                      }}
                    />,
                    'capture.provider'
                  )}
                  {row(
                    t('modelLabel'),
                    <ModelSelect
                      value={cfg.capture.model}
                      disabled={captureOff || cfg.capture.provider.length === 0}
                      placeholder={t('modelPlaceholder')}
                      customSuffix={t('custom')}
                      models={availableCaptureModels}
                      onChange={(model) => {
                        setCfg({ ...cfg, capture: { ...cfg.capture, model } });
                        void commit('capture.model', 'capture', { capture: { model } });
                      }}
                    />,
                    'capture.model'
                  )}
                  {row(
                    t('captureInterval'),
                    <NumberField
                      value={cfg.capture.intervalMinutes}
                      min={1}
                      max={1440}
                      unit={t('unitMinutes')}
                      disabled={captureOff}
                      onDirty={() => setStatus('capture.interval', 'dirty')}
                      onChange={(value) => setCfg({ ...cfg, capture: { ...cfg.capture, intervalMinutes: value } })}
                      onCommit={(value) => void commit('capture.interval', 'capture', { capture: { intervalMinutes: value } })}
                    />,
                    'capture.interval'
                  )}
                  {row(
                    t('captureMaxSessions'),
                    <NumberField
                      value={cfg.capture.maxSessions}
                      min={1}
                      unit={t('unitItems')}
                      disabled={captureOff}
                      onDirty={() => setStatus('capture.maxSessions', 'dirty')}
                      onChange={(value) => setCfg({ ...cfg, capture: { ...cfg.capture, maxSessions: value } })}
                      onCommit={(value) => void commit('capture.maxSessions', 'capture', { capture: { maxSessions: value } })}
                    />,
                    'capture.maxSessions'
                  )}
                  {row(
                    t('captureMaxMessages'),
                    <NumberField
                      value={cfg.capture.maxMessages}
                      min={1}
                      unit={t('unitItems')}
                      disabled={captureOff}
                      onDirty={() => setStatus('capture.maxMessages', 'dirty')}
                      onChange={(value) => setCfg({ ...cfg, capture: { ...cfg.capture, maxMessages: value } })}
                      onCommit={(value) => void commit('capture.maxMessages', 'capture', { capture: { maxMessages: value } })}
                    />,
                    'capture.maxMessages'
                  )}
                  {row(
                    t('captureMaxChars'),
                    <NumberField
                      value={cfg.capture.maxChars}
                      min={0}
                      unit={t('unitChars')}
                      disabled={captureOff}
                      onDirty={() => setStatus('capture.maxChars', 'dirty')}
                      onChange={(value) => setCfg({ ...cfg, capture: { ...cfg.capture, maxChars: value } })}
                      onCommit={(value) => void commit('capture.maxChars', 'capture', { capture: { maxChars: value } })}
                    />,
                    'capture.maxChars',
                    t('recallUnlimited')
                  )}
                  <div className={css.cardActions}>
                    <button
                      type="button"
                      className={`${css.btn} ${css.btnPrimary}`}
                      onClick={() => void runCapture()}
                      disabled={capturing || !captureReady}
                      title={captureReady ? undefined : t('captureNeedModel')}
                    >
                      {capturing ? t('capturing') : t('runCapture')}
                    </button>
                    <span className={css.rowHint}>
                      {`${t('lastCapture')}: ${lastCaptureAt.length > 0 ? lastCaptureAt : t('neverCapture')}`}
                    </span>
                    {captureOutcome !== null ? (
                      <span className={captureOutcome.ok ? css.ok : css.err}>
                        {captureOutcome.ok
                          ? `${t('captureCreated')} ${captureOutcome.created} · ${t('captureUpdated')} ${captureOutcome.updated}`
                          : captureReasonText(t, captureOutcome.reason)}
                      </span>
                    ) : null}
                  </div>
                  {captureTask !== undefined ? (
                    <div className={css.taskBox}>
                      <ProgressBar value={captureTask.progress.completed} max={captureTask.progress.total} />
                      <span className={css.rowHint}>{taskText(t, captureTask)}</span>
                      <button
                        type="button"
                        className={`${css.btn} ${css.btnGhost}`}
                        onClick={() => void cancelTask(captureTask.id)}
                      >
                        {t('taskCancel')}
                      </button>
                    </div>
                  ) : null}
                  {captureOutcome !== null ? (
                    <details>
                      <summary className={css.summary}>{t('captureLog')}</summary>
                      <pre className={css.pre}>{captureOutcome.log}</pre>
                    </details>
                  ) : null}
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
                    t('providerLabel'),
                    <ProviderSelect
                      value={cfg.evolve.provider}
                      disabled={evolveOff}
                      placeholder={t('providerPlaceholder')}
                      providers={providers}
                      onChange={(provider) => {
                        const first = modelsFor(providers, provider)[0]?.id ?? '';
                        setCfg({ ...cfg, evolve: { ...cfg.evolve, provider, model: first } });
                        void commit('evolve.provider', 'evolve', { evolve: { provider, model: first } });
                      }}
                    />,
                    'evolve.provider'
                  )}
                  {row(
                    t('modelLabel'),
                    <ModelSelect
                      value={cfg.evolve.model}
                      disabled={evolveOff || cfg.evolve.provider.length === 0}
                      placeholder={t('modelPlaceholder')}
                      customSuffix={t('custom')}
                      models={availableModels}
                      onChange={(model) => {
                        setCfg({ ...cfg, evolve: { ...cfg.evolve, model } });
                        void commit('evolve.model', 'evolve', { evolve: { model } });
                      }}
                    />,
                    'evolve.model'
                  )}
                  {row(
                    t('dreamHour'),
                    <NumberField
                      value={cfg.evolve.atHour}
                      min={0}
                      max={23}
                      unit={t('unitHour')}
                      disabled={evolveOff}
                      onDirty={() => setStatus('evolve.hour', 'dirty')}
                      onChange={(value) => setCfg({ ...cfg, evolve: { ...cfg.evolve, atHour: value } })}
                      onCommit={(value) => void commit('evolve.hour', 'evolve', { evolve: { atHour: value } })}
                    />,
                    'evolve.hour'
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
                  {evolveTask !== undefined ? (
                    <div className={css.taskBox}>
                      <ProgressBar value={evolveTask.progress.completed} max={evolveTask.progress.total} />
                      <span className={css.rowHint}>{taskText(t, evolveTask)}</span>
                      <button
                        type="button"
                        className={`${css.btn} ${css.btnGhost}`}
                        onClick={() => void cancelTask(evolveTask.id)}
                      >
                        {t('taskCancel')}
                      </button>
                    </div>
                  ) : null}
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

/** 中文命令入口的 token；客户端贡献项按输入原文精确匹配，因此可以直接用中文。 */
const CAPTURE_TOKEN = '记忆';
const DREAM_TOKEN = '入梦';

/** 一次记忆操作的接口与文案。 */
interface MemoryActionSpec {
  /** HTTP 端点（POST）。 */
  endpoint: string;
  /** 命令 token，用于提示前缀。 */
  token: string;
  /** 服务端回包 → 人类可读文案（成功与失败共用）。 */
  describe: (data: Record<string, any>) => string;
}

/** 把可能的非数字收敛成展示用的数字。 */
function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * 在指定会话的输入框弹一条提示。
 *
 * 与宿主内部（CommandUiRuntime 的 noticeFor）走同一条通道：
 * `sessions.scope(sessionId)` → `conversation.input.for(actx).notify(level, text)`。
 * `error` 渲染成 toast，`info` 渲染成输入框上方的行内提示。
 */
function notifySession(
  scope: Record<string, any>,
  session: Record<string, any> | undefined,
  level: 'info' | 'error',
  text: string
): void {
  try {
    const sessions = scope.sessions ?? scope.get?.('sessions');
    const actx = sessions?.scope?.(session?.sessionId);
    const conversation = actx?.get?.('conversation');
    conversation?.input?.for?.(actx)?.notify?.(level, text);
  } catch (error) {
    console.warn('[dream-admin] 提示渲染失败', error);
  }
}

/** 取当前工作区：优先会话上的 cwd，取不到就问服务端的「当前生效」目录。 */
async function currentWorkspace(session: Record<string, any> | undefined): Promise<string> {
  const direct = session?.header?.cwd ?? session?.cwd ?? session?.workspace;
  if (typeof direct === 'string' && direct.trim().length > 0) return direct.trim();
  try {
    const data = await getJson<{ active?: unknown }>(`${API}/workspaces`);
    return typeof data?.active === 'string' ? data.active : '';
  } catch {
    return '';
  }
}

/** 轮询间隔（毫秒）。 */
const TASK_POLL_MS = 1200;

/** 轮询上限（毫秒）：超时即停止等待，避免提示永远挂着。 */
const TASK_POLL_TIMEOUT_MS = 10 * 60_000;

/** 命令 token：中断正在进行的任务（与 `/记忆`、`/入梦` 并列）。 */
const CANCEL_TOKEN = '取消';

/** 等待若干毫秒。 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * 执行一次记忆操作：先起一个长任务，再轮询它的进度，最后把结果转成会话提示。
 *
 * 服务端不再挂着一个长时间的同步请求，因此这里能一边看进度、一边让用户用 `/取消`
 * 或面板按钮中断。进度提示只在阶段 / 计数变化时才发一条，避免刷屏。
 *
 * 因为没有走宿主命令，也就不存在「未配置模型时回退到当前对话模型」这条路：服务端会
 * 直接返回 `model_not_configured`，这里按原因码翻成可读文案。
 */
async function runMemoryAction(
  scope: Record<string, any>,
  session: Record<string, any> | undefined,
  spec: MemoryActionSpec,
  t: (key: string) => string
): Promise<void> {
  const token = spec.token;
  notifySession(scope, session, 'info', `/${token} 正在执行…`);

  let taskId = '';
  try {
    const workspace = await currentWorkspace(session);
    const data = await postJson<{ taskId?: unknown }>(withWorkspace(spec.endpoint, workspace));
    taskId = typeof data?.taskId === 'string' ? data.taskId : '';
  } catch (error) {
    notifySession(scope, session, 'error', `/${token} 失败：${message(error)}`);
    return;
  }
  if (taskId.length === 0) {
    notifySession(scope, session, 'error', `/${token} 失败：服务端未返回任务 id`);
    return;
  }

  const deadline = Date.now() + TASK_POLL_TIMEOUT_MS;
  let lastKey = '';
  for (;;) {
    await sleep(TASK_POLL_MS);
    if (Date.now() > deadline) {
      notifySession(scope, session, 'error', `/${token} 超时：任务仍在进行，可在设置页取消。`);
      return;
    }

    let task: TaskSnapshot | undefined;
    try {
      const response = await fetch(`${API}/tasks?id=${encodeURIComponent(taskId)}`);
      if (!response.ok) {
        notifySession(scope, session, 'error', `/${token} 失败：任务已丢失`);
        return;
      }
      const data = (await response.json()) as { task?: TaskSnapshot };
      task = data?.task;
    } catch {
      // 网络抖动：这一轮跳过，下一轮再取。
      continue;
    }
    if (task === undefined) {
      notifySession(scope, session, 'error', `/${token} 失败：任务已丢失`);
      return;
    }

    if (task.status === 'running') {
      const key = `${task.progress.phase}:${task.progress.completed}:${task.progress.total}`;
      if (key !== lastKey) {
        lastKey = key;
        notifySession(scope, session, 'info', `/${token}：${taskText(t, task)}`);
      }
      continue;
    }

    if (task.status === 'cancelled') {
      notifySession(scope, session, 'info', `/${token}：${t('taskCancelled')}`);
      return;
    }

    const outcome = task.outcome as unknown as Record<string, any> | undefined;
    const text = spec.describe(outcome ?? {});
    if (outcome?.ok === true) {
      notifySession(scope, session, 'info', `/${token}：${text}`);
    } else {
      notifySession(scope, session, 'error', `/${token} 未执行：${text}`);
    }
    return;
  }
}

/** 中断当前在跑的记忆任务（`/取消`）：不带 id，服务端会取消全部在跑任务。 */
async function runCancelAction(
  scope: Record<string, any>,
  session: Record<string, any> | undefined,
  t: (key: string) => string
): Promise<void> {
  try {
    const data = await postJson<{ cancelled?: unknown }>(`${API}/cancel`);
    const count = num(data?.cancelled);
    const text = count > 0 ? `${t('taskCancelAll')} · ${count}` : t('taskNone');
    notifySession(scope, session, 'info', `/${CANCEL_TOKEN}：${text}`);
  } catch (error) {
    notifySession(scope, session, 'error', `/${CANCEL_TOKEN} 失败：${message(error)}`);
  }
}

/**
 * 注册三个中文命令入口：`/记忆`（整理记忆）、`/入梦`、`/取消`。
 *
 * 它们直接调用本插件的 HTTP 接口，因此不注册宿主命令 —— `/` 菜单里就只有这几条中文
 * 命令。`/记忆`、`/入梦` 起长任务后轮询进度，`/取消` 中断全部在跑任务。
 * `commandUi` 是可选服务：没挂它（无 UI 的 spine）时直接跳过，面板与其余能力照常。
 */
function registerCommandEntries(ctx: Record<string, any>, t: (key: string) => string): void {
  if (typeof ctx.inject !== 'function') return;
  ctx.inject(['commandUi', 'sessions'], (scope: Record<string, any>) => {
    const commands = scope.commandUi ?? scope.get?.('commandUi');
    if (commands === undefined || typeof commands.register !== 'function') return;

    const capture: MemoryActionSpec = {
      endpoint: `${API}/capture`,
      token: CAPTURE_TOKEN,
      describe: (data) =>
        data?.ok === true
          ? `新增 ${num(data.created)} 条 · 更新 ${num(data.updated)} 条`
          : captureReasonText(t, data?.reason) || String(data?.log ?? '')
    };
    const dream: MemoryActionSpec = {
      endpoint: `${API}/evolve`,
      token: DREAM_TOKEN,
      describe: (data) =>
        data?.ok === true
          ? `更新 ${num(data.updated)} 条 · 合并 ${num(data.merged)} 条`
          : dreamReasonText(t, data?.reason) || String(data?.log ?? '')
    };

    scope.effect(
      () =>
        commands.register({
          name: CAPTURE_TOKEN,
          label: () => t('cmdCapture'),
          description: () => t('cmdCaptureDesc'),
          icon: DreamAdminIcon,
          available: () => true,
          ui: {
            kind: 'action',
            run: (session: Record<string, any>) => void runMemoryAction(scope, session, capture, t)
          }
        }),
      'dream-admin: /记忆'
    );

    scope.effect(
      () =>
        commands.register({
          name: DREAM_TOKEN,
          label: () => t('cmdDream'),
          description: () => t('cmdDreamDesc'),
          icon: DreamAdminIcon,
          available: () => true,
          ui: {
            kind: 'action',
            run: (session: Record<string, any>) => void runMemoryAction(scope, session, dream, t)
          }
        }),
      'dream-admin: /入梦'
    );

    scope.effect(
      () =>
        commands.register({
          name: CANCEL_TOKEN,
          label: () => t('cmdCancel'),
          description: () => t('cmdCancelDesc'),
          icon: DreamAdminIcon,
          available: () => true,
          ui: {
            kind: 'action',
            run: (session: Record<string, any>) => void runCancelAction(scope, session, t)
          }
        }),
      'dream-admin: /取消'
    );
  });
}

/** client half 入口。 */
export function apply(ctx: Record<string, any>): void {
  try {
    // 词典注册按官方约定挂在 effect 作用域上：语言切换 / 重装载时旧词典先撤销，
    // 避免重复注册。
    if (ctx.locale && typeof ctx.locale.register === 'function') {
      if (typeof ctx.effect === 'function') {
        ctx.effect(() => ctx.locale.register(NS, TXT), 'dream-admin: locale dictionary');
      } else {
        ctx.locale.register(NS, TXT);
      }
    }
    const t: (key: string) => string =
      ctx.locale && typeof ctx.locale.bind === 'function'
        ? ctx.locale.bind(NS)
        : (key: string) => (TXT.en as Record<string, string>)[key] ?? key;

    // 中文命令入口与面板相互独立：面板槽不可用时命令入口仍然注册。
    registerCommandEntries(ctx, t);

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
    console.error('[dream-admin] 客户端注册失败', error);
  }
}
