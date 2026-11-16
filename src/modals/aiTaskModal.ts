import {Modal, Notice, setIcon, type TFile} from 'obsidian';

import type WiseMindObsidianPlugin from '../main';
import {stripSourceMarkers} from '../markers';
import {AiTaskRunner, type AiTaskStepState} from '../services/aiTaskRunner';
import type {AssistantTaskPlan} from '../types';
import {isAbortError, isMembershipLimitError} from '../wisemindApi';

type Phase = 'input' | 'planning' | 'plan' | 'running' | 'done';

const NOTE_CONTENT_LIMIT = 20000;
const NOTE_LIMIT = 20;

/** AI task: the client plans, the user confirms, Obsidian executes locally and can undo. */
export class AiTaskModal extends Modal {
  private phase: Phase = 'input';
  private notes: TFile[];
  private plan: AssistantTaskPlan | null = null;
  private runner: AiTaskRunner | null = null;
  private controller: AbortController | null = null;
  private error = '';
  private bodyEl!: HTMLDivElement;
  private footerEl!: HTMLDivElement;
  private instructionEl: HTMLTextAreaElement | null = null;

  constructor(private plugin: WiseMindObsidianPlugin, notes: TFile[], private instruction = '') {
    super(plugin.app);
    this.notes = notes.slice(0, NOTE_LIMIT);
  }

  onOpen() {
    this.modalEl.addClass('wm2-modal', 'wm2-task-modal');
    this.setTitle(this.plugin.t('aiTask.title'));
    this.contentEl.empty();
    this.bodyEl = this.contentEl.createDiv({cls: 'wm2-task-body'});
    this.footerEl = this.contentEl.createDiv({cls: 'modal-button-container'});
    this.render();
  }

  onClose() {
    // Closing during planning only drops the plan; a running task keeps its undo snapshot until it finishes.
    if (this.phase === 'planning') this.controller?.abort();
    this.contentEl.empty();
  }

  private t(key: string, params?: Record<string, unknown>) {
    return this.plugin.t(key, params);
  }

  private render() {
    this.bodyEl.empty();
    this.footerEl.empty();
    if (this.error) this.bodyEl.createDiv({cls: 'wm2-sync-alert is-error', text: this.error});
    if (this.phase === 'input' || this.phase === 'planning') this.renderInput();
    else this.renderPlan();
  }

  private button(label: string, icon: string, onClick: () => void, primary = false, disabled = false) {
    const button = this.footerEl.createEl('button', {
      cls: ['wm2-task-button', primary ? 'mod-cta' : ''].filter(Boolean),
      attr: {type: 'button'},
    });
    setIcon(button.createSpan({cls: 'wm2-task-button-icon'}), icon);
    button.createSpan({text: label});
    button.disabled = disabled;
    button.addEventListener('click', onClick);
    return button;
  }

  private renderInput() {
    const planning = this.phase === 'planning';
    this.bodyEl.createDiv({cls: 'wm2-task-label', text: this.t('aiTask.instructionLabel')});
    const textarea = this.bodyEl.createEl('textarea', {
      cls: 'wm2-task-instruction',
      attr: {rows: 4, placeholder: this.t('aiTask.instructionPlaceholder')},
    });
    textarea.value = this.instruction;
    textarea.disabled = planning;
    textarea.addEventListener('input', () => {
      this.instruction = textarea.value;
    });
    textarea.addEventListener('keydown', event => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void this.requestPlan();
      }
    });
    this.instructionEl = textarea;
    window.setTimeout(() => this.instructionEl?.focus(), 0);

    this.bodyEl.createDiv({cls: 'wm2-task-label', text: this.t('aiTask.notesLabel', {count: this.notes.length})});
    const list = this.bodyEl.createDiv({cls: 'wm2-task-notes'});
    if (!this.notes.length) list.createDiv({cls: 'wm2-task-hint', text: this.t('aiTask.noNotes')});
    this.notes.forEach(note => {
      const chip = list.createDiv({cls: 'wm2-chip wm2-task-note'});
      chip.createSpan({text: note.basename});
      if (planning) return;
      const remove = chip.createEl('button', {cls: 'clickable-icon', attr: {type: 'button', 'aria-label': this.t('aiTask.removeNote')}});
      setIcon(remove, 'x');
      remove.addEventListener('click', () => {
        this.notes = this.notes.filter(item => item !== note);
        this.render();
      });
    });

    this.button(this.t('common.cancel'), 'x', () => this.close());
    this.button(
      this.t(planning ? 'aiTask.planning' : 'aiTask.plan'),
      planning ? 'loader' : 'sparkles',
      () => void this.requestPlan(),
      true,
      planning,
    );
  }

  private async requestPlan() {
    const instruction = this.instruction.trim();
    if (!instruction || this.phase === 'planning') {
      if (!instruction) new Notice(this.t('aiTask.needInstruction'));
      return;
    }
    this.phase = 'planning';
    this.error = '';
    this.render();
    const controller = new AbortController();
    this.controller = controller;
    try {
      const notes = await Promise.all(this.notes.map(async note => ({
        path: note.path,
        title: note.basename,
        content: stripSourceMarkers(await this.app.vault.cachedRead(note)).slice(0, NOTE_CONTENT_LIMIT),
      })));
      const plan = await this.plugin.api.planAssistantTask({instruction, notes}, {signal: controller.signal});
      if (controller.signal.aborted) return;
      const steps = Array.isArray(plan?.steps) ? plan.steps.filter(step => step && step.path) : [];
      if (!steps.length) throw new Error(this.t('aiTask.emptyPlan'));
      this.plan = {...plan, steps};
      this.runner = new AiTaskRunner(this.plugin, instruction, steps);
      this.phase = 'plan';
    } catch (error) {
      if (isAbortError(error)) return;
      this.phase = 'input';
      this.error = isMembershipLimitError(error) ? this.t('aiTask.limit') : (error as Error)?.message || this.t('aiTask.planFailed');
    } finally {
      if (this.controller === controller) this.controller = null;
    }
    if (this.contentEl.isConnected) this.render();
  }

  private renderPlan() {
    const runner = this.runner;
    const plan = this.plan;
    if (!runner || !plan) return;
    const modifyCount = plan.modifyCount ?? runner.steps.filter(step => step.step.action === 'modify').length;
    const createCount = plan.createCount ?? runner.steps.filter(step => step.step.action === 'create').length;
    this.bodyEl.createDiv({cls: 'wm2-task-label', text: this.instruction});
    this.bodyEl.createDiv({cls: 'wm2-task-summary', text: this.t('aiTask.summary', {modify: modifyCount, create: createCount})});
    const list = this.bodyEl.createEl('ol', {cls: 'wm2-task-steps'});
    runner.steps.forEach(state => this.renderStep(list, state));
    if (this.phase === 'plan') this.bodyEl.createDiv({cls: 'wm2-task-hint', text: this.t('aiTask.confirmHint')});

    if (this.phase === 'plan') {
      this.button(this.t('aiTask.back'), 'arrow-left', () => {
        this.phase = 'input';
        this.render();
      });
      this.button(this.t('aiTask.execute'), 'play', () => void this.execute(), true);
    } else if (this.phase === 'running') {
      this.button(this.t('aiTask.stop'), 'square', () => runner.stop());
    } else {
      if (runner.canUndo) this.button(this.t('aiTask.undo'), 'undo-2', () => void this.undo());
      this.button(this.t('common.close'), 'check', () => this.close(), true);
    }
  }

  private renderStep(list: HTMLElement, state: AiTaskStepState) {
    const item = list.createEl('li', {cls: ['wm2-task-step', `is-${state.status}`]});
    const head = item.createDiv({cls: 'wm2-task-step-head'});
    head.createSpan({
      cls: ['wm2-chip', state.step.action === 'create' ? 'is-success' : 'is-info'],
      text: this.t(state.step.action === 'create' ? 'aiTask.create' : 'aiTask.modify'),
    });
    head.createSpan({cls: 'wm2-task-step-title', text: state.step.title || state.step.path});
    head.createSpan({cls: 'wm2-task-step-status', text: this.t(`aiTask.status.${state.status}`)});
    item.createDiv({cls: 'wm2-task-step-path', text: state.step.path});
    if (state.error) item.createDiv({cls: 'wm2-task-step-error', text: state.error});
  }

  private async execute() {
    const runner = this.runner;
    if (!runner || this.phase !== 'plan') return;
    this.phase = 'running';
    this.render();
    await runner.run(() => {
      if (this.contentEl.isConnected) this.render();
    });
    this.phase = 'done';
    const summary = runner.result();
    new Notice(this.t('aiTask.finished', summary));
    if (this.contentEl.isConnected) this.render();
  }

  private async undo() {
    const runner = this.runner;
    if (!runner) return;
    const restored = await runner.undo();
    new Notice(this.t('aiTask.undone', {count: restored}));
    if (this.contentEl.isConnected) this.render();
  }
}
