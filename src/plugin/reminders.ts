import {watch} from 'vue';
import {Notice} from 'obsidian';

import {WISEMIND_VIEW_TYPE} from '../constants';
import type WiseMindObsidianPlugin from '../main';
import {
  type NoteView,
  openNoteView,
  openPanelTab,
  panelState,
  type PanelTab,
  requestReviewStart,
} from '../services/panelStore';
import {pluginTaskProgress, type PluginTaskStatus} from '../services/pluginTaskProgress';

const TASK_NOTICE_MS = 8000;
const REVIEW_NOTICE_MS = 15000;
const REVIEW_CHECK_INTERVAL_MS = 5 * 60 * 1000;

type TaskRoute = {tab: PanelTab; view?: NoteView};

const routeForTask = (id: string): TaskRoute | null => {
  if (id.startsWith('summary-')) return {tab: 'note', view: 'summary'};
  if (id.startsWith('cards-')) return {tab: 'note', view: 'cards'};
  if (id.startsWith('sync-')) return {tab: 'sync'};
  return null;
};

const todayKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const minutesOf = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

/** Actionable notices: finished background tasks and the once-a-day review reminder. */
export class Reminders {
  private lastStatus = new Map<string, PluginTaskStatus>();

  constructor(private plugin: WiseMindObsidianPlugin) {}

  register() {
    const stop = watch(
      () => pluginTaskProgress.tasks.map(task => `${task.id}:${task.status}`).join('|'),
      () => this.onTasksChanged(),
    );
    this.plugin.register(stop);
    this.plugin.registerInterval(window.setInterval(() => this.maybeRemindReview(), REVIEW_CHECK_INTERVAL_MS));
  }

  /** Shows a notice whose action button runs `action`; clicking anywhere on it also runs the action. */
  notify(message: string, actionLabel: string, action: () => void, timeout = TASK_NOTICE_MS) {
    const fragment = document.createDocumentFragment();
    const body = createDiv({cls: 'wm2-notice'});
    fragment.append(body);
    body.createSpan({cls: 'wm2-notice-text', text: message});
    const button = body.createEl('button', {cls: 'wm2-notice-action', text: actionLabel, attr: {type: 'button'}});
    const notice = new Notice(fragment, timeout);
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      notice.hide();
      action();
    };
    button.addEventListener('click', run);
    body.addEventListener('click', run);
  }

  private onTasksChanged() {
    const seen = new Set<string>();
    for (const task of pluginTaskProgress.tasks) {
      seen.add(task.id);
      const previous = this.lastStatus.get(task.id);
      this.lastStatus.set(task.id, task.status);
      if (previous !== 'running' || task.status === 'running' || task.status === 'cancelled') continue;
      const route = routeForTask(task.id);
      if (!route) continue;
      // Finished work the user is looking at needs no toast; failures always surface.
      if (task.status === 'completed' && this.isShowing(route)) continue;
      const message = task.message ? `${task.title} · ${task.message}` : task.title;
      this.notify(message, this.plugin.t('reminders.view'), () => void this.open(route));
    }
    for (const id of this.lastStatus.keys()) if (!seen.has(id)) this.lastStatus.delete(id);
  }

  private isShowing(route: TaskRoute) {
    if (!document.hasFocus()) return false;
    if (panelState.overlay) return false;
    if (panelState.tab !== route.tab) return false;
    if (route.view && panelState.noteView !== route.view) return false;
    return this.plugin.app.workspace
      .getLeavesOfType(WISEMIND_VIEW_TYPE)
      .some(leaf => leaf.view.containerEl.offsetParent !== null);
  }

  private async open(route: TaskRoute) {
    if (route.view) openNoteView(route.view);
    else openPanelTab(route.tab);
    await this.plugin.activateView();
  }

  /** Called on a timer and after every due-count refresh; fires at most once per calendar day. */
  maybeRemindReview() {
    const review = this.plugin.settings.review;
    if (!review.reminder || !panelState.connected || panelState.dueCount <= 0) return;
    if (this.plugin.transcription?.isActive) return;
    const now = new Date();
    const today = todayKey(now);
    if (review.lastReminderDate === today) return;
    if (now.getHours() * 60 + now.getMinutes() < minutesOf(review.reminderTime)) return;

    review.lastReminderDate = today;
    void this.plugin.saveSettings().catch(() => undefined);
    if (this.isShowing({tab: 'review'})) return;
    this.notify(
      this.plugin.t('reminders.reviewDue', {count: panelState.dueCount}),
      this.plugin.t('reminders.startReview'),
      () => void this.startReview(),
      REVIEW_NOTICE_MS,
    );
  }

  private async startReview() {
    openPanelTab('review');
    await this.plugin.activateView();
    requestReviewStart();
  }
}
