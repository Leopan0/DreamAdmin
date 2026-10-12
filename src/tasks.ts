/**
 * 长任务注册表：「入梦」「整理记忆」一次执行可能持续很久，这里把每次执行登记成一个
 * 带 id 的任务，对外暴露阶段进度、取消信号与终态结果。
 *
 * 为什么需要它：这两个功能原先各是一个同步 HTTP 请求 —— 用户点了按钮就只剩一句
 * 「进行中…」，既看不到进展，也无法中途叫停。改成「起任务 → 轮询进度 → 可取消」之后，
 * 管理页与对话框命令（`/记忆`、`/入梦`、`/取消`）走的是同一套状态。
 *
 * 进度只报「阶段 + 第几个 / 共几个工作区」，**不做剩余时间估算**：模型调用耗时不可
 * 预测，估出来的数字只会误导用户。阶段也以**码**（而非文案）对外，文案由客户端本地化。
 *
 * @module dream-admin/tasks
 */
import type { CaptureOutcome } from './capture.js';
import type { EvolveOutcome } from './evolve.js';

/** 任务种类。 */
export type TaskKind = 'capture' | 'evolve';

/** 执行阶段。 */
export type TaskPhase = 'prepare' | 'scan' | 'model' | 'apply';

/** 任务状态：`running` 时可取消，其余为终态。 */
export type TaskStatus = 'running' | 'done' | 'cancelled';

/** 一次进度上报；未给的字段沿用上一次的值。 */
export interface TaskProgressUpdate {
  phase?: TaskPhase;
  /** 当前正在处理的工作区序号（0 起）。 */
  completed?: number;
  /** 本次要处理的工作区总数。 */
  total?: number;
  /** 当前正在处理的工作区路径。 */
  workspace?: string;
}

/** 进度上报函数：执行器在阶段边界调用它。 */
export type ProgressReporter = (update: TaskProgressUpdate) => void;

/** 进度快照。 */
export interface TaskProgress {
  phase: TaskPhase;
  completed: number;
  total: number;
  workspace?: string;
}

/** 任务快照：HTTP 与 UI 看到的形状。 */
export interface TaskSnapshot {
  id: string;
  kind: TaskKind;
  status: TaskStatus;
  /** 任务登记时刻（ISO）。 */
  startedAt: string;
  /** 最后一次进度 / 状态更新时刻（ISO）。 */
  updatedAt: string;
  progress: TaskProgress;
  /** 终态时的执行结果；仍在上跑时为 undefined。 */
  outcome?: CaptureOutcome | EvolveOutcome;
}

/** 任务执行体：拿上报函数与取消信号，跑完返回结果。 */
export type TaskRunner = (
  report: ProgressReporter,
  signal: AbortSignal
) => Promise<CaptureOutcome | EvolveOutcome>;

/** 长任务注册表。 */
export interface TaskRegistry {
  /** 登记并启动一个任务；立即返回初始快照（不等待执行完）。 */
  start(kind: TaskKind, runner: TaskRunner): TaskSnapshot;
  /** 按 id 取快照。 */
  get(id: string): TaskSnapshot | undefined;
  /** 最近的快照，新的在前（含正在运行的）。 */
  list(): TaskSnapshot[];
  /** 请求取消；任务存在且仍在跑返回 true。 */
  cancel(id: string): boolean;
  /** 取消全部在跑的任务（插件卸载时释放资源用）。 */
  dispose(): void;
}

/** 最多保留多少个已完成任务供轮询 / 回溯。 */
const MAX_TASKS = 20;

/** 创建长任务注册表。 */
export function createTaskRegistry(): TaskRegistry {
  const tasks = new Map<string, TaskSnapshot>();
  const controllers = new Map<string, AbortController>();
  let seq = 0;

  /** 只淘汰已完成的任务，正在跑的永远保留。 */
  const trim = (): void => {
    while (tasks.size > MAX_TASKS) {
      let removed = false;
      for (const [key, task] of tasks) {
        if (task.status !== 'running') {
          tasks.delete(key);
          removed = true;
          break;
        }
      }
      if (!removed) return;
    }
  };

  const clone = (task: TaskSnapshot): TaskSnapshot => ({
    ...task,
    progress: { ...task.progress }
  });

  return {
    start(kind, runner) {
      const id = `${kind}-${Date.now().toString(36)}-${++seq}`;
      const controller = new AbortController();
      const now = new Date().toISOString();
      const task: TaskSnapshot = {
        id,
        kind,
        status: 'running',
        startedAt: now,
        updatedAt: now,
        progress: { phase: 'prepare', completed: 0, total: 0 }
      };
      tasks.set(id, task);
      controllers.set(id, controller);
      trim();

      const report: ProgressReporter = (update) => {
        if (task.status !== 'running') return;
        task.progress = { ...task.progress, ...update };
        task.updatedAt = new Date().toISOString();
      };

      void runner(report, controller.signal)
        .then((outcome) => {
          task.outcome = outcome;
          // cancel() 已经把状态置成 cancelled，这里不要把它改回 done。
          if (task.status === 'running') {
            task.status = controller.signal.aborted ? 'cancelled' : 'done';
          }
          task.updatedAt = new Date().toISOString();
        })
        .catch(() => {
          if (task.status === 'running') {
            task.status = controller.signal.aborted ? 'cancelled' : 'done';
          }
          task.updatedAt = new Date().toISOString();
        })
        .finally(() => {
          controllers.delete(id);
        });

      return clone(task);
    },

    get(id) {
      const task = tasks.get(id);
      return task === undefined ? undefined : clone(task);
    },

    list() {
      return [...tasks.values()].reverse().map(clone);
    },

    cancel(id) {
      const controller = controllers.get(id);
      const task = tasks.get(id);
      if (controller === undefined || task === undefined) return false;
      if (task.status !== 'running') return false;
      controller.abort();
      // 立刻置终态，让 UI / 轮询马上看到反馈；执行体在下一个阶段边界停下。
      task.status = 'cancelled';
      task.updatedAt = new Date().toISOString();
      return true;
    },

    dispose() {
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
    }
  };
}