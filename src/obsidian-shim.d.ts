declare module 'obsidian' {
  export class Notice {
    constructor(message: string, timeout?: number);
  }

  export class MarkdownRenderer {
    static renderMarkdown(markdown: string, el: HTMLElement, sourcePath: string, component: unknown): Promise<void>;
    static render(app: App, markdown: string, el: HTMLElement, sourcePath: string, component: unknown): Promise<void>;
  }

  export function addIcon(iconId: string, svgContent: string): void;
  export function setIcon(parent: HTMLElement, iconId: string): void;
  export function openExternal(url: string): Promise<void>;
  export const moment: {
    locale(): string;
  };

  export class Plugin {
    app: App;
    manifest: { id: string; dir?: string };
    loadData(): Promise<unknown>;
    saveData(data: unknown): Promise<void>;
    addCommand(command: Command): void;
    addRibbonIcon(icon: string, title: string, callback: (evt: MouseEvent) => unknown): HTMLElement;
    addSettingTab(tab: PluginSettingTab): void;
    registerEvent(eventRef: unknown): void;
    registerDomEvent(el: Window | Document | HTMLElement, type: string, callback: EventListenerOrEventListenerObject): void;
    addStatusBarItem(): HTMLElement;
    registerView(type: string, viewCreator: (leaf: WorkspaceLeaf) => ItemView): void;
  }

  export class PluginSettingTab {
    app: App;
    plugin: Plugin;
    containerEl: HTMLElement;
    constructor(app: App, plugin: Plugin);
    display(): void;
  }

  export class Modal {
    app: App;
    contentEl: HTMLElement;
    titleEl: HTMLElement;
    constructor(app: App);
    open(): void;
    close(): void;
    onOpen(): void;
    onClose(): void;
  }

  export class Setting {
    constructor(containerEl: HTMLElement);
    setName(name: string): this;
    setDesc(desc: string): this;
    setHeading(): this;
    addText(callback: (component: TextComponent) => unknown): this;
    addToggle(callback: (component: ToggleComponent) => unknown): this;
    addButton(callback: (component: ButtonComponent) => unknown): this;
    addDropdown(callback: (component: DropdownComponent) => unknown): this;
  }

  export class TextComponent {
    setPlaceholder(value: string): this;
    setValue(value: string): this;
    onChange(callback: (value: string) => unknown): this;
  }

  export class ToggleComponent {
    setValue(value: boolean): this;
    onChange(callback: (value: boolean) => unknown): this;
  }

  export class ButtonComponent {
    setButtonText(value: string): this;
    setCta(): this;
    setDisabled(value: boolean): this;
    onClick(callback: () => unknown): this;
  }

  export class DropdownComponent {
    selectEl: HTMLSelectElement;
    addOption(value: string, display: string): this;
    setValue(value: string): this;
    onChange(callback: (value: string) => unknown): this;
  }

  export class ItemView {
    app: App;
    contentEl: HTMLElement;
    leaf: WorkspaceLeaf;
    constructor(leaf: WorkspaceLeaf);
    getViewType(): string;
    getDisplayText(): string;
    getIcon?(): string;
    onOpen(): Promise<void>;
    onClose(): Promise<void>;
  }

  export class TAbstractFile {
    path: string;
    name: string;
  }

  export class TFile extends TAbstractFile {
    basename: string;
    extension: string;
    parent: TFolder | null;
    stat: { mtime: number; ctime: number; size: number };
  }

  export class TFolder extends TAbstractFile {
    children: TAbstractFile[];
  }

  export interface Menu {
    addItem(callback: (item: MenuItem) => unknown): void;
  }

  export interface MenuItem {
    setTitle(title: string): this;
    setIcon(icon: string): this;
    onClick(callback: () => unknown): this;
  }

  export interface Command {
    id: string;
    name: string;
    callback?: () => unknown;
    editorCallback?: (editor: Editor, view: MarkdownView) => unknown;
  }

  export interface Editor {
    getSelection(): string;
  }

  export interface MarkdownView {
    file: TFile | null;
  }

  export interface Vault {
    getMarkdownFiles(): TFile[];
    cachedRead(file: TFile): Promise<string>;
    read(file: TFile): Promise<string>;
    create(path: string, data: string): Promise<TFile>;
    modify(file: TFile, data: string): Promise<void>;
    process(file: TFile, callback: (data: string) => string): Promise<string>;
    createFolder(path: string): Promise<TFolder>;
    getAbstractFileByPath(path: string): TAbstractFile | null;
  }

  export interface Workspace {
    getActiveFile(): TFile | null;
    getActiveViewOfType<T>(type: new (...args: any[]) => T): T | null;
    getLeavesOfType(type: string): WorkspaceLeaf[];
    getRightLeaf(split: boolean): WorkspaceLeaf | null;
    revealLeaf(leaf: WorkspaceLeaf): Promise<void>;
    on(name: 'file-menu', callback: (menu: Menu, file: TAbstractFile) => unknown): unknown;
    on(name: 'files-menu', callback: (menu: Menu, files: TAbstractFile[]) => unknown): unknown;
    on(name: 'editor-menu', callback: (menu: Menu, editor: Editor, view: MarkdownView) => unknown): unknown;
    registerView(type: string, viewCreator: (leaf: WorkspaceLeaf) => ItemView): void;
  }

  export interface WorkspaceLeaf {
    setViewState(state: { type: string; active?: boolean }): Promise<void>;
  }

  export interface App {
    vault: Vault;
    workspace: Workspace;
  }
}

interface HTMLElement {
  empty(): void;
  createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs?: { text?: string; cls?: string; attr?: Record<string, string> },
  ): HTMLElementTagNameMap[K];
  createDiv(attrs?: { text?: string; cls?: string; attr?: Record<string, string> }): HTMLDivElement;
  setText(text: string): void;
  addClass(...classes: string[]): void;
}
