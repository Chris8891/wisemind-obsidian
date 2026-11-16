declare module 'obsidian' {
  export class Notice {
    constructor(message: string | DocumentFragment, timeout?: number);
    hide(): void;
  }

  export class Component {
    load(): void;
    unload(): void;
    onload(): void;
    onunload(): void;
    addChild<T extends Component>(component: T): T;
    removeChild<T extends Component>(component: T): T;
    register(cb: () => unknown): void;
    registerEvent(eventRef: EventRef): void;
    registerDomEvent(el: Window | Document | HTMLElement, type: string, callback: EventListenerOrEventListenerObject): void;
    registerInterval(id: number): number;
  }

  export type EventRef = unknown;

  export class MarkdownRenderer {
    static renderMarkdown(markdown: string, el: HTMLElement, sourcePath: string, component: Component): Promise<void>;
    static render(app: App, markdown: string, el: HTMLElement, sourcePath: string, component: Component): Promise<void>;
  }

  export function addIcon(iconId: string, svgContent: string): void;
  export function setIcon(parent: HTMLElement, iconId: string): void;
  export function setTooltip(el: HTMLElement, tooltip: string, options?: { placement?: 'top' | 'bottom' | 'left' | 'right' }): void;
  export function openExternal(url: string): Promise<void>;
  export function normalizePath(path: string): string;
  export function debounce<T extends unknown[]>(cb: (...args: T) => unknown, timeout?: number, resetTimer?: boolean): ((...args: T) => void) & { cancel(): void };
  export const Platform: {
    isMacOS: boolean;
  };
  export const moment: {
    locale(): string;
  };

  export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    dir?: string;
  }

  export class Plugin extends Component {
    app: App;
    manifest: PluginManifest;
    loadData(): Promise<unknown>;
    saveData(data: unknown): Promise<void>;
    addCommand(command: Command): Command;
    addRibbonIcon(icon: string, title: string, callback: (evt: MouseEvent) => unknown): HTMLElement;
    addSettingTab(tab: PluginSettingTab): void;
    addStatusBarItem(): HTMLElement;
    registerView(type: string, viewCreator: (leaf: WorkspaceLeaf) => ItemView): void;
    registerEditorExtension(extension: unknown): void;
    registerEditorSuggest(editorSuggest: EditorSuggest<any>): void;
  }

  export interface EditorSuggestTriggerInfo {
    start: EditorPosition;
    end: EditorPosition;
    query: string;
  }

  export interface EditorSuggestContext extends EditorSuggestTriggerInfo {
    editor: Editor;
    file: TFile;
  }

  export abstract class EditorSuggest<T> {
    app: App;
    context: EditorSuggestContext | null;
    limit: number;
    constructor(app: App);
    close(): void;
    abstract onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null;
    abstract getSuggestions(context: EditorSuggestContext): T[] | Promise<T[]>;
    abstract renderSuggestion(value: T, el: HTMLElement): void;
    abstract selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void;
  }

  export interface DataAdapter {
    exists(normalizedPath: string): Promise<boolean>;
    read(normalizedPath: string): Promise<string>;
    write(normalizedPath: string, data: string): Promise<void>;
    remove(normalizedPath: string): Promise<void>;
  }

  export class PluginSettingTab {
    app: App;
    plugin: Plugin;
    containerEl: HTMLElement;
    constructor(app: App, plugin: Plugin);
    display(): void;
    hide(): void;
  }

  export class Modal {
    app: App;
    containerEl: HTMLElement;
    modalEl: HTMLElement;
    contentEl: HTMLElement;
    titleEl: HTMLElement;
    scope: Scope;
    constructor(app: App);
    open(): void;
    close(): void;
    onOpen(): void;
    onClose(): void;
    setTitle(title: string): this;
  }

  export type Modifier = 'Mod' | 'Shift' | 'Alt' | 'Ctrl' | 'Meta';

  export class Scope {
    register(modifiers: Modifier[] | null, key: string | null, func: (evt: KeyboardEvent) => boolean | void): unknown;
  }

  export class Setting {
    settingEl: HTMLElement;
    controlEl: HTMLElement;
    constructor(containerEl: HTMLElement);
    setName(name: string | DocumentFragment): this;
    setDesc(desc: string | DocumentFragment): this;
    setHeading(): this;
    setClass(cls: string): this;
    addText(callback: (component: TextComponent) => unknown): this;
    addTextArea(callback: (component: TextAreaComponent) => unknown): this;
    addToggle(callback: (component: ToggleComponent) => unknown): this;
    addButton(callback: (component: ButtonComponent) => unknown): this;
    addExtraButton(callback: (component: ExtraButtonComponent) => unknown): this;
    addDropdown(callback: (component: DropdownComponent) => unknown): this;
    addSlider(callback: (component: SliderComponent) => unknown): this;
  }

  export class TextComponent {
    inputEl: HTMLInputElement;
    setPlaceholder(value: string): this;
    setValue(value: string): this;
    getValue(): string;
    onChange(callback: (value: string) => unknown): this;
  }

  export class TextAreaComponent {
    inputEl: HTMLTextAreaElement;
    setPlaceholder(value: string): this;
    setValue(value: string): this;
    getValue(): string;
    onChange(callback: (value: string) => unknown): this;
  }

  export class ToggleComponent {
    setValue(value: boolean): this;
    onChange(callback: (value: boolean) => unknown): this;
  }

  export class SliderComponent {
    setLimits(min: number, max: number, step: number | 'any'): this;
    setValue(value: number): this;
    setDynamicTooltip(): this;
    onChange(callback: (value: number) => unknown): this;
  }

  export class ButtonComponent {
    buttonEl: HTMLButtonElement;
    setButtonText(value: string): this;
    setIcon(icon: string): this;
    setTooltip(tooltip: string): this;
    setCta(): this;
    setWarning(): this;
    setDisabled(value: boolean): this;
    onClick(callback: (evt: MouseEvent) => unknown): this;
  }

  export class ExtraButtonComponent {
    setIcon(icon: string): this;
    setTooltip(tooltip: string): this;
    onClick(callback: () => unknown): this;
  }

  export class DropdownComponent {
    selectEl: HTMLSelectElement;
    addOption(value: string, display: string): this;
    addOptions(options: Record<string, string>): this;
    setValue(value: string): this;
    getValue(): string;
    onChange(callback: (value: string) => unknown): this;
  }

  export class ItemView extends Component {
    app: App;
    containerEl: HTMLElement;
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
    parent: TFolder | null;
  }

  export class TFile extends TAbstractFile {
    basename: string;
    extension: string;
    stat: { mtime: number; ctime: number; size: number };
  }

  export class TFolder extends TAbstractFile {
    children: TAbstractFile[];
    isRoot(): boolean;
  }

  export class Menu {
    constructor();
    addItem(callback: (item: MenuItem) => unknown): this;
    addSeparator(): this;
    showAtMouseEvent(evt: MouseEvent): this;
    showAtPosition(position: { x: number; y: number }): this;
    hide(): this;
  }

  export interface MenuItem {
    setTitle(title: string): this;
    setIcon(icon: string | null): this;
    setSection(section: string): this;
    setChecked(checked: boolean | null): this;
    setDisabled(disabled: boolean): this;
    setSubmenu(): Menu;
    onClick(callback: (evt: MouseEvent | KeyboardEvent) => unknown): this;
  }

  export interface Command {
    id: string;
    name: string;
    icon?: string;
    callback?: () => unknown;
    checkCallback?: (checking: boolean) => boolean | void;
    editorCallback?: (editor: Editor, view: MarkdownView) => unknown;
    editorCheckCallback?: (checking: boolean, editor: Editor, view: MarkdownView) => boolean | void;
  }

  export interface EditorPosition {
    line: number;
    ch: number;
  }

  export interface EditorRange {
    from: EditorPosition;
    to: EditorPosition;
  }

  export interface EditorSelection {
    anchor: EditorPosition;
    head: EditorPosition;
  }

  export interface EditorChange extends Partial<EditorRange> {
    text: string;
  }

  export interface Editor {
    getSelection(): string;
    getValue(): string;
    getLine(line: number): string;
    lineCount(): number;
    getRange(from: EditorPosition, to: EditorPosition): string;
    getCursor(side?: 'from' | 'to' | 'head' | 'anchor'): EditorPosition;
    posToOffset(pos: EditorPosition): number;
    offsetToPos(offset: number): EditorPosition;
    listSelections(): EditorSelection[];
    setCursor(pos: EditorPosition | number, ch?: number): void;
    setSelection(anchor: EditorPosition, head?: EditorPosition): void;
    replaceSelection(text: string): void;
    replaceRange(text: string, from: EditorPosition, to?: EditorPosition): void;
    transaction(tx: { changes?: EditorChange[]; selection?: EditorRange }): void;
    scrollIntoView(range: EditorRange, center?: boolean): void;
    focus(): void;
  }

  export class MarkdownView extends ItemView {
    file: TFile | null;
    editor: Editor;
  }

  export interface CachedMetadata {
    tags?: { tag: string }[];
    links?: { link: string }[];
    frontmatter?: Record<string, unknown>;
    headings?: { heading: string; level: number }[];
  }

  export interface MetadataCache {
    getFileCache(file: TFile): CachedMetadata | null;
    getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null;
    fileToLinktext(file: TFile, sourcePath: string, omitMdExtension?: boolean): string;
    resolvedLinks: Record<string, Record<string, number>>;
  }

  export interface FileManager {
    processFrontMatter(file: TFile, fn: (frontmatter: Record<string, any>) => void): Promise<void>;
    generateMarkdownLink(file: TFile, sourcePath: string, subpath?: string, alias?: string): string;
    trashFile(file: TAbstractFile): Promise<void>;
  }

  export interface Vault {
    adapter: DataAdapter;
    configDir: string;
    getName(): string;
    getMarkdownFiles(): TFile[];
    cachedRead(file: TFile): Promise<string>;
    read(file: TFile): Promise<string>;
    create(path: string, data: string): Promise<TFile>;
    modify(file: TFile, data: string): Promise<void>;
    process(file: TFile, callback: (data: string) => string): Promise<string>;
    createFolder(path: string): Promise<TFolder>;
    getAbstractFileByPath(path: string): TAbstractFile | null;
    on(name: 'rename', callback: (file: TAbstractFile, oldPath: string) => unknown): EventRef;
    on(name: 'modify' | 'delete' | 'create', callback: (file: TAbstractFile) => unknown): EventRef;
    offref(ref: EventRef): void;
  }

  export interface Workspace {
    activeEditor: { editor?: Editor; file?: TFile | null } | null;
    getActiveFile(): TFile | null;
    getActiveViewOfType<T>(type: abstract new (...args: any[]) => T): T | null;
    getLeavesOfType(type: string): WorkspaceLeaf[];
    getLastOpenFiles(): string[];
    getRightLeaf(split: boolean): WorkspaceLeaf | null;
    getLeaf(newLeaf?: boolean | 'tab' | 'split' | 'window'): WorkspaceLeaf;
    revealLeaf(leaf: WorkspaceLeaf): Promise<void>;
    openLinkText(linktext: string, sourcePath: string, newLeaf?: boolean): Promise<void>;
    on(name: 'file-menu', callback: (menu: Menu, file: TAbstractFile, source: string) => unknown): EventRef;
    on(name: 'files-menu', callback: (menu: Menu, files: TAbstractFile[], source: string) => unknown): EventRef;
    on(name: 'editor-menu', callback: (menu: Menu, editor: Editor, view: MarkdownView) => unknown): EventRef;
    on(name: 'file-open', callback: (file: TFile | null) => unknown): EventRef;
    on(name: 'active-leaf-change', callback: (leaf: WorkspaceLeaf | null) => unknown): EventRef;
    on(name: 'layout-change' | 'css-change', callback: () => unknown): EventRef;
    offref(ref: EventRef): void;
    onLayoutReady(callback: () => unknown): void;
  }

  export interface WorkspaceLeaf {
    view: ItemView;
    setViewState(state: { type: string; active?: boolean }): Promise<void>;
    openFile(file: TFile, state?: { eState?: Record<string, unknown> }): Promise<void>;
  }

  export interface App {
    vault: Vault;
    workspace: Workspace;
    metadataCache: MetadataCache;
    fileManager: FileManager;
  }
}

type DomElementInfo = {
  text?: string;
  cls?: string | string[];
  attr?: Record<string, string | number | boolean>;
  title?: string;
  type?: string;
  value?: string;
  placeholder?: string;
};

declare function createDiv(attrs?: DomElementInfo): HTMLDivElement;
declare function createEl<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: DomElementInfo): HTMLElementTagNameMap[K];
declare function createSpan(attrs?: DomElementInfo): HTMLSpanElement;

interface HTMLElement {
  empty(): void;
  createEl<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: DomElementInfo): HTMLElementTagNameMap[K];
  createDiv(attrs?: DomElementInfo): HTMLDivElement;
  createSpan(attrs?: DomElementInfo): HTMLSpanElement;
  setText(text: string): void;
  addClass(...classes: string[]): void;
  removeClass(...classes: string[]): void;
  toggleClass(classes: string | string[], value: boolean): void;
  setCssProps(props: Record<string, string>): void;
}

interface Element {
  toggleClass(classes: string | string[], value: boolean): void;
}

interface Node {
  appendText(text: string): void;
}
