import type {
  HostMessage,
  LanguageInfo,
  LanguagePreference,
  UILanguage,
  WebviewMessage
} from '../src/protocol';
import { isHostMessage, isLanguagePreference, isUILanguage } from '../src/protocol';
import type { MessageKey } from './i18n';
import { applyStaticTranslations, translate } from './i18n';

interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

type ToolId =
  | 'pencil'
  | 'eraser'
  | 'eyedropper'
  | 'fill'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'wand'
  | 'select'
  | 'ellipseSelect'
  | 'move'
  | 'hand';

type PaintTool = 'pencil' | 'eraser' | 'line' | 'rect' | 'ellipse';
type BrushShape = 'square' | 'circle';
type ColorButton = 'primary' | 'secondary';
type SelectionKind = 'rect' | 'mask';
type SelectionMode = 'replace' | 'add' | 'subtract';

interface SelectionState {
  kind: SelectionKind;
  bounds: Rect;
  mask: Uint8Array | null;
}

interface Point {
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface FloatingSelection {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  w: number;
  h: number;
  mask: Uint8Array | null;
}

interface ClipboardImage {
  w: number;
  h: number;
  data: Uint8ClampedArray;
  originX: number;
  originY: number;
  mask: Uint8Array | null;
}

interface ToolDefinition {
  id: ToolId;
  nameKey: MessageKey;
  key: string;
  icon: string;
}

interface Prefs {
  tool: ToolId;
  brushSize: number;
  brushShape: BrushShape;
  opacity: number;
  primary: string;
  secondary: string;
  shapeFill: boolean;
  tolerance: number;
  contiguous: boolean;
  showGrid: boolean;
  sheetEnabled: boolean;
  cellW: number;
  cellH: number;
  frameStart: number;
  frameEnd: number;
  fps: number;
  loop: boolean;
  previewBg: string;
  palette: string[];
  recent: string[];
}

const vscode = acquireVsCodeApi();

const ZOOM_LEVELS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64];
const MAX_HISTORY = 40;

const DEFAULT_PALETTE = [
  '#000000', '#1d2b53', '#7e2553', '#008751',
  '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
  '#ff004d', '#ffa300', '#ffec27', '#00e436',
  '#29adff', '#83769c', '#ff77a8', '#ffccaa'
];

const ICONS: Record<ToolId, string> = {
  pencil:
    '<path d="M4 20l1.2-4.2L16.7 4.3a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8.2 18.8 4 20z"/><path d="M14.5 6.5l3 3"/>',
  eraser:
    '<path d="M7.5 19.5l-3.8-3.8a1.6 1.6 0 0 1 0-2.3l8.4-8.4a1.6 1.6 0 0 1 2.3 0l3.8 3.8a1.6 1.6 0 0 1 0 2.3l-6.1 6.1H7.5z"/><path d="M10.5 8.5l5 5"/>',
  eyedropper:
    '<path d="M15.2 3.6a2.2 2.2 0 0 1 3.1 0l2.1 2.1a2.2 2.2 0 0 1 0 3.1l-2.6 2.6-5.2-5.2 2.6-2.6z"/><path d="M14 7l-8 8-1.4 4.4L9 18l8-8"/>',
  fill:
    '<path d="M5.5 3.5l9.6 9.6a1.6 1.6 0 0 1 0 2.2l-4.4 4.4a1.6 1.6 0 0 1-2.2 0l-5.2-5.2a1.6 1.6 0 0 1 0-2.2L8 8.7"/><path d="M3 9h13"/><path d="M20 14.5c1 1.4 1.6 2.2 1.6 2.9a1.6 1.6 0 1 1-3.2 0c0-.7.6-1.5 1.6-2.9z"/>',
  wand:
    '<path d="M4 20l9.5-9.5"/><path d="M13.5 4.5l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z"/><path d="M18.5 12.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/>',
  line:
    '<path d="M4 20L20 4"/><rect x="2.5" y="18.5" width="3" height="3"/><rect x="18.5" y="2.5" width="3" height="3"/>',
  rect: '<rect x="4" y="6" width="16" height="12"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8" ry="6"/>',
  select: '<rect x="3.5" y="3.5" width="17" height="17" stroke-dasharray="3 2.2"/>',
  ellipseSelect: '<ellipse cx="12" cy="12" rx="8" ry="6" stroke-dasharray="3 2.2"/>',
  move:
    '<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  hand:
    '<path d="M8.5 13V6.2a1.5 1.5 0 0 1 3 0V11"/><path d="M11.5 11V4.8a1.5 1.5 0 0 1 3 0V11"/><path d="M14.5 11V6.2a1.5 1.5 0 0 1 3 0V14"/><path d="M17.5 11.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.6a5 5 0 0 1-3.6-1.6L5.6 15.6a1.6 1.6 0 0 1 2.3-2.2l2.6 2.4"/>'
};

const TOOLS: ToolDefinition[] = [
  { id: 'pencil', nameKey: 'tool.pencil', key: 'B', icon: ICONS.pencil },
  { id: 'eraser', nameKey: 'tool.eraser', key: 'E', icon: ICONS.eraser },
  { id: 'eyedropper', nameKey: 'tool.eyedropper', key: 'I', icon: ICONS.eyedropper },
  { id: 'fill', nameKey: 'tool.fill', key: 'G', icon: ICONS.fill },
  { id: 'line', nameKey: 'tool.line', key: 'L', icon: ICONS.line },
  { id: 'rect', nameKey: 'tool.rect', key: 'R', icon: ICONS.rect },
  { id: 'ellipse', nameKey: 'tool.ellipse', key: 'O', icon: ICONS.ellipse },
  { id: 'wand', nameKey: 'tool.wand', key: 'W', icon: ICONS.wand },
  { id: 'select', nameKey: 'tool.select', key: 'M', icon: ICONS.select },
  { id: 'ellipseSelect', nameKey: 'tool.ellipseSelect', key: 'Q', icon: ICONS.ellipseSelect },
  { id: 'move', nameKey: 'tool.move', key: 'V', icon: ICONS.move },
  { id: 'hand', nameKey: 'tool.hand', key: 'H', icon: ICONS.hand }
];

const TOOL_SHORTCUTS: Record<string, ToolId> = {
  b: 'pencil',
  e: 'eraser',
  i: 'eyedropper',
  g: 'fill',
  l: 'line',
  r: 'rect',
  o: 'ellipse',
  w: 'wand',
  m: 'select',
  q: 'ellipseSelect',
  v: 'move',
  h: 'hand'
};

const PAINT_TOOLS: PaintTool[] = ['pencil', 'eraser', 'line', 'rect', 'ellipse'];

const DEFAULTS: Prefs = {
  tool: 'pencil',
  brushSize: 1,
  brushShape: 'square',
  opacity: 100,
  primary: '#000000',
  secondary: '#ffffff',
  shapeFill: false,
  tolerance: 0,
  contiguous: true,
  showGrid: true,
  sheetEnabled: false,
  cellW: 16,
  cellH: 16,
  frameStart: 0,
  frameEnd: 0,
  fps: 8,
  loop: true,
  previewBg: 'checker',
  palette: [...DEFAULT_PALETTE],
  recent: []
};

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Elemento no encontrado: ${id}`);
  }
  return element as T;
}

function input(id: string): HTMLInputElement {
  return $<HTMLInputElement>(id);
}

function context2d(canvas: HTMLCanvasElement, readFrequently = true): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: readFrequently });
  if (!ctx) {
    throw new Error('El contexto 2D del canvas no está disponible.');
  }
  return ctx;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function normalizeHex(value: string): string | null {
  const trimmed = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(trimmed)) {
    const expanded = trimmed
      .split('')
      .map((part) => part + part)
      .join('');
    return `#${expanded.toLowerCase()}`;
  }
  if (/^[0-9a-f]{6}$/i.test(trimmed)) {
    return `#${trimmed.toLowerCase()}`;
  }
  return null;
}

function hexToRgb(hex: string): Rgb {
  const normalized = normalizeHex(hex) ?? '#000000';
  const value = Number.parseInt(normalized.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

function rgbToHex(color: Rgb): string {
  const toHex = (channel: number) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function coerceInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return clamp(Math.round(number), min, max);
}

function coerceBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function coerceHex(value: unknown, fallback: string): string {
  return isHexColor(value) ? value.toLowerCase() : fallback;
}

function coerceHexArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const result: string[] = [];
  for (const entry of value) {
    if (isHexColor(entry) && !result.includes(entry.toLowerCase())) {
      result.push(entry.toLowerCase());
    }
  }
  return result;
}

function isToolId(value: unknown): value is ToolId {
  return typeof value === 'string' && TOOLS.some((tool) => tool.id === value);
}

function readPrefs(): Prefs {
  let state: unknown;
  try {
    state = vscode.getState();
  } catch (error) {
    console.warn('No se pudo recuperar el estado del editor.', error);
    state = undefined;
  }
  const root = isRecord(state) ? state : {};
  const raw = isRecord(root.prefs) ? root.prefs : {};
  return {
    tool: isToolId(raw.tool) ? raw.tool : DEFAULTS.tool,
    brushSize: coerceInt(raw.brushSize, 1, 32, DEFAULTS.brushSize),
    brushShape: raw.brushShape === 'circle' ? 'circle' : 'square',
    opacity: coerceInt(raw.opacity, 1, 100, DEFAULTS.opacity),
    primary: coerceHex(raw.primary, DEFAULTS.primary),
    secondary: coerceHex(raw.secondary, DEFAULTS.secondary),
    shapeFill: coerceBool(raw.shapeFill, DEFAULTS.shapeFill),
    tolerance: coerceInt(raw.tolerance, 0, 100, DEFAULTS.tolerance),
    contiguous: coerceBool(raw.contiguous, DEFAULTS.contiguous),
    showGrid: coerceBool(raw.showGrid, DEFAULTS.showGrid),
    sheetEnabled: coerceBool(raw.sheetEnabled, DEFAULTS.sheetEnabled),
    cellW: coerceInt(raw.cellW, 1, 4096, DEFAULTS.cellW),
    cellH: coerceInt(raw.cellH, 1, 4096, DEFAULTS.cellH),
    frameStart: coerceInt(raw.frameStart, 0, 100000, DEFAULTS.frameStart),
    frameEnd: coerceInt(raw.frameEnd, 0, 100000, DEFAULTS.frameEnd),
    fps: coerceInt(raw.fps, 1, 60, DEFAULTS.fps),
    loop: coerceBool(raw.loop, DEFAULTS.loop),
    previewBg: typeof raw.previewBg === 'string' ? raw.previewBg : DEFAULTS.previewBg,
    palette: coerceHexArray(raw.palette, DEFAULTS.palette),
    recent: coerceHexArray(raw.recent, DEFAULTS.recent)
  };
}

function cloneImageData(image: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
}

function rectIsValid(rect: Rect): boolean {
  return rect.w > 0 && rect.h > 0;
}

function readInitialLanguage(): UILanguage {
  const attribute = document.documentElement.dataset.initialLanguage;
  if (isUILanguage(attribute)) {
    return attribute;
  }
  return navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
}

function isEditingElement(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  if (element.isContentEditable) {
    return true;
  }
  if (element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') {
    return true;
  }
  if (element instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(element.type);
  }
  return false;
}

export class PixelEditor {
  private prefs: Prefs = readPrefs();
  private language: UILanguage = 'en';
  private languagePreference: LanguagePreference = 'auto';
  private systemLanguage: UILanguage = 'en';

  private readonly view = $<HTMLCanvasElement>('view');
  private readonly viewCtx = context2d(this.view, false);
  private readonly preview = $<HTMLCanvasElement>('preview');
  private readonly previewCtx = context2d(this.preview, false);
  private readonly previewBox = $('previewBox');

  private readonly toolGroup = $('toolGroup');
  private readonly brushSizeInput = input('brushSize');
  private readonly opacityInput = input('opacity');
  private readonly opacityValue = $('opacityVal');
  private readonly primaryInput = input('primaryColor');
  private readonly secondaryInput = input('secondaryColor');
  private readonly hexInput = input('hexInput');
  private readonly languageSelect = $<HTMLSelectElement>('languageSelect');
  private readonly undoButton = $<HTMLButtonElement>('undoBtn');
  private readonly redoButton = $<HTMLButtonElement>('redoBtn');
  private readonly saveButton = $<HTMLButtonElement>('saveBtn');
  private readonly zoomResetButton = $<HTMLButtonElement>('zoomReset');
  private readonly gridButton = $<HTMLButtonElement>('gridToggle');
  private readonly statusCoords = $('statusCoords');
  private readonly statusTool = $('statusTool');
  private readonly statusInfo = $('statusInfo');
  private readonly statusZoom = $('statusZoom');
  private readonly overlay = $('overlay');
  private readonly overlayText = $('overlayText');
  private readonly toastElement = $('toast');
  private readonly imageSize = $('imageSize');
  private readonly resizeW = input('resizeW');
  private readonly resizeH = input('resizeH');
  private readonly sheetEnabledInput = input('sheetEnabled');
  private readonly sheetBody = $('sheetBody');
  private readonly cellWInput = input('cellW');
  private readonly cellHInput = input('cellH');
  private readonly frameStartInput = input('frameStart');
  private readonly frameEndInput = input('frameEnd');
  private readonly fpsInput = input('fps');
  private readonly sheetInfo = $('sheetInfo');
  private readonly frameCounter = $('frameCounter');
  private readonly playButton = $<HTMLButtonElement>('playBtn');
  private readonly prevFrameButton = $<HTMLButtonElement>('prevFrame');
  private readonly nextFrameButton = $<HTMLButtonElement>('nextFrame');
  private readonly previewBgInput = $<HTMLSelectElement>('previewBg');
  private readonly loopInput = input('loop');
  private readonly brushShapeInput = $<HTMLSelectElement>('brushShape');
  private readonly shapeFillInput = input('shapeFill');
  private readonly toleranceInput = input('tolerance');
  private readonly toleranceValue = $('toleranceVal');
  private readonly contiguousInput = input('contiguous');
  private readonly paletteElement = $('palette');
  private readonly recentElement = $('recentPalette');
  private readonly toolOptions = $('toolOptionsBody');
  private readonly selectAllButton = $<HTMLButtonElement>('selAll');
  private readonly selectNoneButton = $<HTMLButtonElement>('selNone');
  private readonly selectCopyButton = $<HTMLButtonElement>('selCopy');
  private readonly selectCutButton = $<HTMLButtonElement>('selCut');
  private readonly selectPasteButton = $<HTMLButtonElement>('selPaste');
  private readonly selectDeleteButton = $<HTMLButtonElement>('selDelete');

  private docCanvas: HTMLCanvasElement | null = null;
  private docCtx: CanvasRenderingContext2D | null = null;
  private buffer: ImageData | null = null;
  private width = 0;
  private height = 0;

  private strokeMask = new Uint32Array(0);
  private strokeVersion = 0;

  private history: ImageData[] = [];
  private historyIndex = -1;
  private savedIndex = 0;
  private maxHistory = MAX_HISTORY;
  private lastDirty = false;

  private selection: SelectionState | null = null;
  private floating: FloatingSelection | null = null;
  private preFloat: ImageData | null = null;
  private preFloatSelection: SelectionState | null = null;
  private clipboard: ClipboardImage | null = null;
  private strokeChanged = false;

  private selecting = false;
  private selectShape: 'rect' | 'ellipse' = 'rect';
  private selectMode: SelectionMode = 'replace';
  private selectBase: SelectionState | null = null;
  private selectAnchor: Point = { x: 0, y: 0 };
  private selectPreview: Rect | null = null;

  private dragFloat = false;
  private floatDragOrigin: Point = { x: 0, y: 0 };
  private floatStart: Point = { x: 0, y: 0 };

  private strokeActive = false;
  private strokeTool: PaintTool = 'pencil';
  private strokeStart: Point = { x: 0, y: 0 };
  private lastPaint: Point = { x: 0, y: 0 };
  private strokeErase = false;
  private strokeColor: Rgb = { r: 0, g: 0, b: 0 };
  private strokeAlpha = 1;
  private dragBase: ImageData | null = null;
  private strokeBase: ImageData | null = null;
  private strokePath: Point[] = [];
  private strokeStraight = false;

  private panning = false;
  private panStart = { x: 0, y: 0, panX: 0, panY: 0 };
  private spaceDown = false;

  private picking = false;
  private pickButton: ColorButton = 'primary';

  private hover: Point | null = null;
  private zoom = 8;
  private panX = 0;
  private panY = 0;
  private pendingFit = true;
  private needsRender = true;
  private previewDirty = true;

  private frameIndex = 0;
  private playing = false;
  private animationAccumulator = 0;
  private lastAnimationTime = performance.now();
  private toastTimer: number | undefined;
  private checkerCanvas: HTMLCanvasElement | null = null;
  private checkerPattern: CanvasPattern | null = null;

  constructor() {
    const initialLanguage = readInitialLanguage();
    this.language = initialLanguage;
    this.systemLanguage = initialLanguage;
    applyStaticTranslations(this.language);
    this.buildToolButtons();
    this.bindEvents();
    this.applyPrefsToUi();
    this.updateLanguageUi();
    this.renderPalette();
    this.updateSelectionUi();
    this.updateHistoryUi();
    this.resizeView();
    this.updateStatusInfo();
    this.startLoop();
    vscode.postMessage({ type: 'ready' });
  }

  handleHostMessage(message: HostMessage): void {
    switch (message.type) {
      case 'init':
        this.applyLanguageInfo(message);
        this.loadImage(message.dataUrl);
        break;
      case 'load':
        this.applyLanguageInfo(message);
        this.loadImage(message.dataUrl);
        break;
      case 'language':
        this.applyLanguageInfo(message);
        break;
      case 'serialize':
        this.serialize(message.id);
        break;
      case 'saved':
        this.savedIndex = message.historyIndex >= 0 ? message.historyIndex : this.historyIndex;
        this.updateDirty();
        this.showToast(this.t('toast.saved'));
        break;
      case 'saveError':
        this.showToast(this.t('toast.saveError', { message: message.message }), true);
        break;
      case 'action':
        switch (message.action) {
          case 'undo':
            this.undo();
            break;
          case 'redo':
            this.redo();
            break;
          case 'copy':
            this.copySelection();
            break;
          case 'cut':
            this.cutSelection();
            break;
          case 'paste':
            this.pasteClipboard();
            break;
          case 'selectAll':
            this.selectAll();
            break;
          case 'deselect':
            this.deselect();
            break;
        }
        break;
    }
  }

  private buildToolButtons(): void {
    for (const tool of TOOLS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tool-btn';
      button.dataset.tool = tool.id;
      button.title = `${this.t(tool.nameKey)} (${tool.key})`;
      button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${tool.icon}</svg>`;
      button.addEventListener('click', () => this.setTool(tool.id));
      this.toolGroup.appendChild(button);
    }
  }

  private bindEvents(): void {
    this.brushSizeInput.addEventListener('change', () => this.setBrushSize(Number(this.brushSizeInput.value)));
    this.brushSizeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.brushSizeInput.blur();
      }
    });
    this.opacityInput.addEventListener('input', () => this.setOpacity(Number(this.opacityInput.value)));
    this.primaryInput.addEventListener('input', () => this.setPrimary(this.primaryInput.value, false));
    this.primaryInput.addEventListener('change', () => this.setPrimary(this.primaryInput.value, true));
    this.secondaryInput.addEventListener('input', () => this.setSecondary(this.secondaryInput.value));
    this.hexInput.addEventListener('change', () => this.applyHexInput());
    this.hexInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.applyHexInput();
        this.hexInput.blur();
      }
    });
    $('swapColors').addEventListener('click', () => this.swapColors());
    this.brushShapeInput.addEventListener('change', () => {
      this.prefs.brushShape = this.brushShapeInput.value === 'circle' ? 'circle' : 'square';
      this.persistPrefs();
    });
    this.shapeFillInput.addEventListener('change', () => {
      this.prefs.shapeFill = this.shapeFillInput.checked;
      this.persistPrefs();
    });
    this.toleranceInput.addEventListener('input', () => {
      this.prefs.tolerance = clamp(Number(this.toleranceInput.value), 0, 100);
      this.toleranceValue.textContent = String(this.prefs.tolerance);
      this.persistPrefs();
    });
    this.contiguousInput.addEventListener('change', () => {
      this.prefs.contiguous = this.contiguousInput.checked;
      this.persistPrefs();
    });
    $('gridToggle').addEventListener('click', () => this.toggleGrid());
    this.undoButton.addEventListener('click', () => this.undo());
    this.redoButton.addEventListener('click', () => this.redo());
    this.saveButton.addEventListener('click', () => this.requestSave());
    $('zoomOut').addEventListener('click', () => this.stepZoom(-1));
    $('zoomIn').addEventListener('click', () => this.stepZoom(1));
    this.zoomResetButton.addEventListener('click', () => this.resetZoom());
    $('fitBtn').addEventListener('click', () => this.fitToView());

    this.languageSelect.addEventListener('change', () => this.onLanguageChange());
    this.sheetEnabledInput.addEventListener('change', () => this.setSheetEnabled(this.sheetEnabledInput.checked));
    this.cellWInput.addEventListener('change', () => this.onCellSizeChange('w'));
    this.cellHInput.addEventListener('change', () => this.onCellSizeChange('h'));
    this.frameStartInput.addEventListener('change', () => this.onFrameRangeChange());
    this.frameEndInput.addEventListener('change', () => this.onFrameRangeChange());
    this.fpsInput.addEventListener('change', () => this.onFpsChange());
    this.playButton.addEventListener('click', () => this.togglePlay());
    this.prevFrameButton.addEventListener('click', () => this.stepFrame(-1));
    this.nextFrameButton.addEventListener('click', () => this.stepFrame(1));
    this.previewBgInput.addEventListener('change', () => {
      this.prefs.previewBg = this.previewBgInput.value;
      this.applyPreviewBackground();
      this.persistPrefs();
    });
    this.loopInput.addEventListener('change', () => {
      this.prefs.loop = this.loopInput.checked;
      this.persistPrefs();
    });

    this.selectAllButton.addEventListener('click', () => this.selectAll());
    this.selectNoneButton.addEventListener('click', () => this.deselect());
    this.selectCopyButton.addEventListener('click', () => this.copySelection());
    this.selectCutButton.addEventListener('click', () => this.cutSelection());
    this.selectPasteButton.addEventListener('click', () => this.pasteClipboard());
    this.selectDeleteButton.addEventListener('click', () => this.deleteSelection());

    $('resizeApply').addEventListener('click', () => this.resizeImage());
    $('flipH').addEventListener('click', () => this.flipImage(true));
    $('flipV').addEventListener('click', () => this.flipImage(false));
    $('clearBtn').addEventListener('click', () => this.clearImage());
    $('addSwatch').addEventListener('click', () => this.addCurrentSwatch());

    this.view.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.view.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.view.addEventListener('pointerup', (event) => this.onPointerUp(event));
    this.view.addEventListener('pointercancel', (event) => this.onPointerUp(event));
    this.view.addEventListener('pointerleave', () => this.onPointerLeave());
    this.view.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
    this.view.addEventListener('contextmenu', (event) => event.preventDefault());

    let focused = false;
    const postFocusState = (): void => {
      vscode.postMessage({
        type: 'focusState',
        focused,
        editing: isEditingElement(document.activeElement)
      });
    };
    window.addEventListener('focus', () => {
      focused = true;
      postFocusState();
    });
    window.addEventListener('blur', () => {
      focused = false;
      postFocusState();
    });
    document.addEventListener('pointerdown', () => {
      focused = true;
      window.setTimeout(postFocusState, 0);
    });
    document.addEventListener('focusin', () => window.setTimeout(postFocusState, 0));
    document.addEventListener('focusout', () => window.setTimeout(postFocusState, 0));

    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    window.addEventListener('keyup', (event) => this.onKeyUp(event));
    window.addEventListener('blur', () => {
      this.spaceDown = false;
      this.updateCursor();
    });

    const viewport = $('viewport');
    new ResizeObserver(() => this.resizeView()).observe(viewport);
    new ResizeObserver(() => this.fitPreview()).observe(this.previewBox);
    window.addEventListener('resize', () => this.resizeView());

    window.setInterval(() => {
      if (this.selection || this.floating || this.selecting) {
        this.needsRender = true;
      }
    }, 120);
  }

  private applyPrefsToUi(): void {
    this.brushSizeInput.value = String(this.prefs.brushSize);
    this.opacityInput.value = String(this.prefs.opacity);
    this.opacityValue.textContent = `${this.prefs.opacity}%`;
    this.primaryInput.value = this.prefs.primary;
    this.secondaryInput.value = this.prefs.secondary;
    this.hexInput.value = this.prefs.primary;
    this.brushShapeInput.value = this.prefs.brushShape;
    this.shapeFillInput.checked = this.prefs.shapeFill;
    this.toleranceInput.value = String(this.prefs.tolerance);
    this.toleranceValue.textContent = String(this.prefs.tolerance);
    this.contiguousInput.checked = this.prefs.contiguous;
    this.sheetEnabledInput.checked = this.prefs.sheetEnabled;
    this.fpsInput.value = String(this.prefs.fps);
    this.loopInput.checked = this.prefs.loop;
    this.previewBgInput.value = this.prefs.previewBg;
    this.applyPreviewBackground();
    this.gridButton.classList.toggle('active', this.prefs.showGrid);
    this.setTool(this.prefs.tool, false);
    this.updateToolButtons();
  }

  private persistPrefs(): void {
    vscode.setState({ prefs: this.prefs });
  }

  private t(key: MessageKey, values?: Record<string, string | number>): string {
    return translate(this.language, key, values);
  }

  private onLanguageChange(): void {
    const preference = this.languageSelect.value;
    if (!isLanguagePreference(preference)) {
      return;
    }
    this.languagePreference = preference;
    const language = preference === 'auto' ? this.systemLanguage : preference;
    this.applyLanguageInfo({
      language,
      preference,
      systemLanguage: this.systemLanguage
    });
    vscode.postMessage({ type: 'setLanguage', preference });
  }

  private applyLanguageInfo(info: LanguageInfo): void {
    this.language = info.language;
    this.languagePreference = info.preference;
    this.systemLanguage = info.systemLanguage;
    applyStaticTranslations(this.language);
    this.updateLanguageUi();
    this.updateToolButtons();
    this.renderPalette();
    if (this.buffer) {
      this.updateSheetUi();
    } else {
      this.updateSheetInfoText();
      this.updatePlayButton();
    }
    this.updateStatusInfo();
    this.updateOverlayText();
    this.needsRender = true;
  }

  private updateLanguageUi(): void {
    this.languageSelect.value = this.languagePreference;
    const systemLanguageName = this.systemLanguage === 'es' ? 'Español' : 'English';
    this.languageSelect.title = `${this.t('language.title')} · ${this.t('language.auto')}: ${systemLanguageName}`;
    this.toolGroup.setAttribute('aria-label', this.t('tools.aria'));
  }

  private updateOverlayText(): void {
    if (this.overlay.classList.contains('hidden')) {
      return;
    }
    const key: MessageKey = this.overlay.classList.contains('error') ? 'loading.error' : 'loading.image';
    this.overlayText.textContent = this.t(key);
  }

  private setTool(tool: ToolId, persist = true): void {
    if (this.floating && this.prefs.tool !== tool) {
      this.commitFloat();
    }
    this.prefs.tool = tool;
    this.updateToolButtons();
    this.updateToolOptions();
    this.updateCursor();
    this.updateStatusInfo();
    if (persist) {
      this.persistPrefs();
    }
  }

  private updateToolButtons(): void {
    const buttons = this.toolGroup.querySelectorAll<HTMLButtonElement>('button[data-tool]');
    for (const button of buttons) {
      button.classList.toggle('active', button.dataset.tool === this.prefs.tool);
      const tool = TOOLS.find((entry) => entry.id === button.dataset.tool);
      if (tool) {
        button.title = `${this.t(tool.nameKey)} (${tool.key})`;
      }
    }
  }

  private updateToolOptions(): void {
    const sections = this.toolOptions.querySelectorAll<HTMLElement>('[data-tools]');
    for (const section of sections) {
      const tools = (section.dataset.tools ?? '').split(/\s+/);
      section.classList.toggle('hidden', !tools.includes(this.prefs.tool));
    }
  }

  private updateCursor(): void {
    let cursor = 'crosshair';
    if (this.panning) {
      cursor = 'grabbing';
    } else if (this.spaceDown || this.prefs.tool === 'hand') {
      cursor = 'grab';
    } else if (this.prefs.tool === 'move') {
      cursor = 'move';
    }
    this.view.style.cursor = cursor;
  }

  private setBrushSize(value: number): void {
    this.prefs.brushSize = clamp(Number.isFinite(value) ? Math.round(value) : 1, 1, 32);
    this.brushSizeInput.value = String(this.prefs.brushSize);
    this.persistPrefs();
    this.updateStatusInfo();
    this.needsRender = true;
  }

  private setOpacity(value: number): void {
    this.prefs.opacity = clamp(Number.isFinite(value) ? Math.round(value) : 100, 1, 100);
    this.opacityValue.textContent = `${this.prefs.opacity}%`;
    this.persistPrefs();
  }

  private setPrimary(hex: string, remember: boolean): void {
    const normalized = normalizeHex(hex);
    if (!normalized) {
      return;
    }
    this.prefs.primary = normalized;
    this.primaryInput.value = normalized;
    this.hexInput.value = normalized;
    if (remember) {
      this.addRecent(normalized);
    }
    this.persistPrefs();
    this.renderPalette();
  }

  private setSecondary(hex: string): void {
    const normalized = normalizeHex(hex);
    if (!normalized) {
      return;
    }
    this.prefs.secondary = normalized;
    this.secondaryInput.value = normalized;
    this.persistPrefs();
    this.renderPalette();
  }

  private swapColors(): void {
    const primary = this.prefs.primary;
    this.prefs.primary = this.prefs.secondary;
    this.prefs.secondary = primary;
    this.primaryInput.value = this.prefs.primary;
    this.secondaryInput.value = this.prefs.secondary;
    this.hexInput.value = this.prefs.primary;
    this.persistPrefs();
    this.renderPalette();
  }

  private applyHexInput(): void {
    const normalized = normalizeHex(this.hexInput.value);
    if (normalized) {
      this.setPrimary(normalized, true);
    } else {
      this.hexInput.value = this.prefs.primary;
      this.showToast(this.t('toast.invalidHex'), true);
    }
  }

  private addRecent(hex: string): void {
    const recent = this.prefs.recent.filter((color) => color !== hex);
    recent.unshift(hex);
    this.prefs.recent = recent.slice(0, 12);
    this.renderPalette();
  }

  private renderPalette(): void {
    this.paletteElement.replaceChildren();
    this.prefs.palette.forEach((color, index) => {
      this.paletteElement.appendChild(this.createSwatch(color, index >= DEFAULT_PALETTE.length));
    });
    this.recentElement.replaceChildren();
    for (const color of this.prefs.recent) {
      this.recentElement.appendChild(this.createSwatch(color, false));
    }
  }

  private createSwatch(color: string, removable: boolean): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.style.background = color;
    button.dataset.color = color;
    button.title = this.t(removable ? 'swatch.removeTitle' : 'swatch.title', { hex: color });
    if (color === this.prefs.primary) {
      button.classList.add('active');
    }
    button.addEventListener('click', (event) => {
      if (event.altKey && removable) {
        this.prefs.palette = this.prefs.palette.filter((entry) => entry !== color);
        this.persistPrefs();
        this.renderPalette();
        return;
      }
      this.setPrimary(color, true);
    });
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.setSecondary(color);
    });
    return button;
  }

  private addCurrentSwatch(): void {
    if (this.prefs.palette.includes(this.prefs.primary)) {
      this.showToast(this.t('toast.duplicateColor'));
      return;
    }
    this.prefs.palette.push(this.prefs.primary);
    this.persistPrefs();
    this.renderPalette();
  }

  private toggleGrid(): void {
    this.prefs.showGrid = !this.prefs.showGrid;
    this.gridButton.classList.toggle('active', this.prefs.showGrid);
    this.persistPrefs();
    this.needsRender = true;
  }

  private loadImage(dataUrl: string): void {
    this.setOverlay('loading');
    const image = new Image();
    image.addEventListener('load', () => {
      this.setupDocument(image);
      this.resetHistory();
      this.pendingFit = true;
      this.tryFit();
      this.hideOverlay();
      this.showToast(this.t('toast.imageReady'));
    });
    image.addEventListener('error', () => {
      this.setOverlay('error');
    });
    image.src = dataUrl;
  }

  private setupDocument(image: HTMLImageElement): void {
    this.width = Math.max(1, image.naturalWidth);
    this.height = Math.max(1, image.naturalHeight);
    this.docCanvas = createCanvas(this.width, this.height);
    this.docCtx = context2d(this.docCanvas);
    this.docCtx.imageSmoothingEnabled = false;
    this.docCtx.drawImage(image, 0, 0);
    this.buffer = this.docCtx.getImageData(0, 0, this.width, this.height);
    this.strokeMask = new Uint32Array(this.width * this.height);
    this.strokeVersion = 0;
    this.maxHistory = clamp(Math.floor(80000000 / (this.width * this.height * 4)), 2, MAX_HISTORY);
    this.selection = null;
    this.floating = null;
    this.preFloat = null;
    this.preFloatSelection = null;
    this.dragBase = null;
    this.strokeActive = false;
    this.selecting = false;
    this.selectBase = null;
    this.selectPreview = null;
    this.dragFloat = false;
    this.playing = false;
    this.frameIndex = 0;
    this.imageSize.textContent = `${this.width} × ${this.height}`;
    this.resizeW.value = String(this.width);
    this.resizeH.value = String(this.height);
    this.resizeW.max = '4096';
    this.resizeH.max = '4096';
    this.prefs.cellW = clamp(this.prefs.cellW, 1, this.width);
    this.prefs.cellH = clamp(this.prefs.cellH, 1, this.height);
    this.prefs.frameStart = 0;
    this.prefs.frameEnd = Math.max(0, this.metrics().frames - 1);
    this.cellWInput.max = String(this.width);
    this.cellHInput.max = String(this.height);
    this.updateSheetUi();
    this.applyPreviewBackground();
    this.fitPreview();
    this.updateSelectionUi();
    this.updateHistoryUi();
    this.updateStatusInfo();
    this.needsRender = true;
    this.previewDirty = true;
    this.syncDoc();
  }

  private setOverlay(state: 'loading' | 'error'): void {
    const isError = state === 'error';
    this.overlayText.textContent = this.t(isError ? 'loading.error' : 'loading.image');
    this.overlay.classList.remove('hidden');
    this.overlay.classList.toggle('error', isError);
  }

  private hideOverlay(): void {
    this.overlay.classList.add('hidden');
    this.overlay.classList.remove('error');
  }

  private showToast(message: string, isError = false): void {
    this.toastElement.textContent = message;
    this.toastElement.classList.toggle('error', isError);
    this.toastElement.classList.add('show');
    if (this.toastTimer !== undefined) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => {
      this.toastElement.classList.remove('show');
      this.toastTimer = undefined;
    }, 1800);
  }

  private startLoop(): void {
    const loop = (now: number): void => {
      if (this.needsRender) {
        this.needsRender = false;
        this.render();
      }
      this.stepAnimation(now);
      if (this.previewDirty) {
        this.previewDirty = false;
        this.renderPreview();
      }
      window.requestAnimationFrame(loop);
    };
    window.requestAnimationFrame(loop);
  }

  private resizeView(): void {
    const rect = this.view.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.view.width !== width || this.view.height !== height) {
      this.view.width = width;
      this.view.height = height;
    }
    if (this.pendingFit) {
      this.tryFit();
    }
    this.needsRender = true;
  }

  private tryFit(): void {
    const rect = this.view.getBoundingClientRect();
    if (!this.buffer || rect.width < 20 || rect.height < 20) {
      return;
    }
    this.fitToView();
    this.pendingFit = false;
  }

  private fitToView(): void {
    const rect = this.view.getBoundingClientRect();
    if (!this.buffer || rect.width < 20 || rect.height < 20) {
      return;
    }
    const availableW = Math.max(1, rect.width - 40);
    const availableH = Math.max(1, rect.height - 40);
    let chosen = ZOOM_LEVELS[0];
    for (const level of ZOOM_LEVELS) {
      if (this.width * level <= availableW && this.height * level <= availableH) {
        chosen = level;
      }
    }
    this.zoom = chosen;
    this.centerImage(rect.width, rect.height);
    this.updateStatusInfo();
    this.needsRender = true;
  }

  private centerImage(viewWidth: number, viewHeight: number): void {
    const imageW = this.width * this.zoom;
    const imageH = this.height * this.zoom;
    this.panX = Math.round(imageW <= viewWidth - 40 ? (viewWidth - imageW) / 2 : 20);
    this.panY = Math.round(imageH <= viewHeight - 40 ? (viewHeight - imageH) / 2 : 20);
  }

  private resetZoom(): void {
    const rect = this.view.getBoundingClientRect();
    this.zoom = 1;
    this.centerImage(rect.width, rect.height);
    this.updateStatusInfo();
    this.needsRender = true;
  }

  private stepZoom(direction: number): void {
    const rect = this.view.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    this.zoomAt(direction > 0 ? 1 : -1, centerX, centerY);
  }

  private zoomAt(direction: number, screenX: number, screenY: number): void {
    if (!this.buffer) {
      return;
    }
    let index = 0;
    for (let i = 0; i < ZOOM_LEVELS.length; i += 1) {
      if (ZOOM_LEVELS[i] <= this.zoom) {
        index = i;
      }
    }
    const nextIndex = clamp(index + direction, 0, ZOOM_LEVELS.length - 1);
    const nextZoom = ZOOM_LEVELS[nextIndex];
    if (nextZoom === this.zoom) {
      return;
    }
    const imageX = (screenX - this.panX) / this.zoom;
    const imageY = (screenY - this.panY) / this.zoom;
    this.zoom = nextZoom;
    this.panX = Math.round(screenX - imageX * nextZoom);
    this.panY = Math.round(screenY - imageY * nextZoom);
    this.updateStatusInfo();
    this.needsRender = true;
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = this.view.getBoundingClientRect();
    this.zoomAt(event.deltaY < 0 ? 1 : -1, event.clientX - rect.left, event.clientY - rect.top);
  }

  private updateStatusInfo(): void {
    const parts: string[] = [];
    const bounds = this.floating
      ? { x: this.floating.x, y: this.floating.y, w: this.floating.w, h: this.floating.h }
      : this.selecting
        ? this.selectPreview
        : this.selection?.bounds ?? null;
    if (bounds) {
      const selection = this.t('status.selection', { w: bounds.w, h: bounds.h });
      parts.push(this.floating ? this.t('status.floating', { label: selection }) : selection);
    }
    if (this.buffer) {
      parts.push(`${this.width}×${this.height}`);
    }
    if (this.prefs.sheetEnabled && this.buffer) {
      const metrics = this.metrics();
      parts.push(this.t('status.frame', { current: this.frameIndex + 1, total: metrics.frames }));
    }
    this.statusInfo.textContent = parts.join(' · ');
    const zoomText = `${Math.round(this.zoom * 100)}%`;
    this.statusZoom.textContent = zoomText;
    this.zoomResetButton.textContent = zoomText;
    const tool = TOOLS.find((entry) => entry.id === this.prefs.tool);
    this.statusTool.textContent = tool ? this.t(tool.nameKey) : '';
  }

  private updateCoords(clientX: number, clientY: number): void {
    if (!this.buffer) {
      this.statusCoords.textContent = '—';
      return;
    }
    const point = this.rawPoint(clientX, clientY);
    if (point.x < 0 || point.y < 0 || point.x >= this.width || point.y >= this.height) {
      this.statusCoords.textContent = '—';
      return;
    }
    this.statusCoords.textContent = `${point.x}, ${point.y}`;
  }

  private rawPoint(clientX: number, clientY: number): Point {
    const rect = this.view.getBoundingClientRect();
    return {
      x: Math.floor((clientX - rect.left - this.panX) / this.zoom),
      y: Math.floor((clientY - rect.top - this.panY) / this.zoom)
    };
  }

  private clampedPoint(clientX: number, clientY: number): Point {
    const point = this.rawPoint(clientX, clientY);
    return {
      x: clamp(point.x, 0, this.width - 1),
      y: clamp(point.y, 0, this.height - 1)
    };
  }

  private isInsideImage(clientX: number, clientY: number): boolean {
    const point = this.rawPoint(clientX, clientY);
    return point.x >= 0 && point.y >= 0 && point.x < this.width && point.y < this.height;
  }

  private selectionMode(event: PointerEvent): SelectionMode {
    if (event.altKey) {
      return 'subtract';
    }
    if (event.shiftKey) {
      return 'add';
    }
    return 'replace';
  }

  private onPointerDown(event: PointerEvent): void {
    if (!this.buffer) {
      return;
    }
    this.view.focus();
    if (event.button === 1 || (event.button === 0 && (this.spaceDown || this.prefs.tool === 'hand'))) {
      event.preventDefault();
      this.panning = true;
      this.panStart = {
        x: event.clientX,
        y: event.clientY,
        panX: this.panX,
        panY: this.panY
      };
      this.capturePointer(event.pointerId);
      this.updateCursor();
      return;
    }
    if (event.button !== 0 && event.button !== 2) {
      return;
    }
    if (!this.isInsideImage(event.clientX, event.clientY)) {
      if (this.floating) {
        this.commitFloat();
      }
      return;
    }
    event.preventDefault();
    this.capturePointer(event.pointerId);
    const point = this.rawPoint(event.clientX, event.clientY);
    const button: ColorButton = event.button === 2 ? 'secondary' : 'primary';
    const color = button === 'secondary' ? this.prefs.secondary : this.prefs.primary;
    const tool = this.prefs.tool;

    if (tool === 'eyedropper') {
      this.picking = true;
      this.pickButton = button;
      this.pickColor(point, button);
      return;
    }

    if (tool === 'select' || tool === 'ellipseSelect') {
      if (this.floating) {
        this.commitFloat();
      }
      this.startSelection(point, tool === 'ellipseSelect' ? 'ellipse' : 'rect', this.selectionMode(event));
      return;
    }

    if (tool === 'move') {
      if (!this.floating) {
        if (!this.selection) {
          this.selection = {
            kind: 'rect',
            bounds: { x: 0, y: 0, w: this.width, h: this.height },
            mask: null
          };
        }
        this.beginFloat();
      }
      this.startFloatDrag(point);
      return;
    }

    if (tool === 'wand') {
      if (this.floating) {
        this.commitFloat();
      }
      this.selectWand(point, this.selectionMode(event));
      return;
    }

    if (this.floating) {
      this.commitFloat();
    }

    const rgb = hexToRgb(color);
    const alpha = this.prefs.opacity / 100;

    if (tool === 'fill') {
      const changed = this.floodFill(point.x, point.y, rgb, alpha);
      if (changed) {
        this.pushHistory();
      }
      return;
    }

    if (!PAINT_TOOLS.includes(tool as PaintTool)) {
      return;
    }

    this.beginStrokeVersion();
    this.strokeActive = true;
    this.strokeTool = tool as PaintTool;
    this.strokeStart = point;
    this.lastPaint = point;
    this.strokeErase = tool === 'eraser';
    this.strokeColor = rgb;
    this.strokeAlpha = alpha;
    this.dragBase = null;
    this.strokeChanged = false;
    this.strokeBase = null;
    this.strokePath = [];
    this.strokeStraight = event.shiftKey;

    if (tool === 'line' || tool === 'rect' || tool === 'ellipse') {
      this.dragBase = this.cloneBuffer();
      this.updateShape(point, event.shiftKey, event.altKey);
    } else {
      if (tool === 'pencil' || tool === 'eraser') {
        this.strokeBase = this.cloneBuffer();
        this.strokePath = [{ ...point }];
      }
      this.stampAt(point.x, point.y, this.strokeErase, rgb, alpha);
      this.syncDoc();
    }
    this.needsRender = true;
  }

  private onPointerMove(event: PointerEvent): void {
    this.updateCoords(event.clientX, event.clientY);
    if (!this.buffer) {
      return;
    }
    if (this.panning) {
      this.panX = this.panStart.panX + (event.clientX - this.panStart.x);
      this.panY = this.panStart.panY + (event.clientY - this.panStart.y);
      this.needsRender = true;
      return;
    }

    if (this.picking) {
      if (this.isInsideImage(event.clientX, event.clientY)) {
        this.pickColor(this.rawPoint(event.clientX, event.clientY), this.pickButton);
      }
      return;
    }

    if (this.strokeActive) {
      const point = this.clampedPoint(event.clientX, event.clientY);
      if (this.strokeTool === 'pencil' || this.strokeTool === 'eraser') {
        this.updatePixelStroke(point, event.shiftKey);
      } else {
        this.updateShape(point, event.shiftKey, event.altKey);
      }
      this.needsRender = true;
      return;
    }

    if (this.selecting) {
      const point = this.clampedPoint(event.clientX, event.clientY);
      const clamped = this.clampSelection(this.rectFromPoints(this.selectAnchor, point));
      this.selectPreview = clamped;
      this.updateStatusInfo();
      this.needsRender = true;
      return;
    }

    if (this.dragFloat && this.floating) {
      const point = this.rawPoint(event.clientX, event.clientY);
      this.floating.x = this.floatStart.x + (point.x - this.floatDragOrigin.x);
      this.floating.y = this.floatStart.y + (point.y - this.floatDragOrigin.y);
      this.updateStatusInfo();
      this.needsRender = true;
      return;
    }

    const inside = this.isInsideImage(event.clientX, event.clientY);
    const nextHover = inside ? this.rawPoint(event.clientX, event.clientY) : null;
    const changed = (nextHover?.x ?? -1) !== (this.hover?.x ?? -1) || (nextHover?.y ?? -1) !== (this.hover?.y ?? -1);
    this.hover = nextHover;
    if (changed) {
      this.needsRender = true;
    }
  }

  private onPointerUp(event: PointerEvent): void {
    this.releasePointer(event.pointerId);
    if (this.panning) {
      this.panning = false;
      this.updateCursor();
    }
    if (this.picking) {
      this.picking = false;
    }
    const finalPoint = this.clampedPoint(event.clientX, event.clientY);
    if (this.strokeActive) {
      if (this.strokeTool === 'pencil' || this.strokeTool === 'eraser') {
        if (finalPoint.x !== this.lastPaint.x || finalPoint.y !== this.lastPaint.y || event.shiftKey) {
          this.updatePixelStroke(finalPoint, event.shiftKey);
        }
      } else {
        this.updateShape(finalPoint, event.shiftKey, event.altKey);
      }
      this.strokeActive = false;
      this.dragBase = null;
      this.strokeBase = null;
      this.strokePath = [];
      this.strokeStraight = false;
      if (this.strokeChanged) {
        this.pushHistory();
      }
      this.strokeChanged = false;
    }
    if (this.selecting) {
      const clamped = this.clampSelection(this.rectFromPoints(this.selectAnchor, finalPoint));
      const moved = clamped !== null && (clamped.w > 1 || clamped.h > 1);
      const addition = moved && clamped ? this.selectionFromShape(clamped, this.selectShape) : null;
      this.selection = this.combineSelection(this.selectBase, addition, this.selectMode);
      this.selecting = false;
      this.selectPreview = null;
      this.selectBase = null;
      this.updateSelectionUi();
      this.updateStatusInfo();
      this.needsRender = true;
    }
    if (this.dragFloat) {
      this.dragFloat = false;
      this.updateStatusInfo();
      this.needsRender = true;
    }
  }

  private onPointerLeave(): void {
    if (this.hover) {
      this.hover = null;
      this.needsRender = true;
    }
    if (!this.panning && !this.strokeActive && !this.dragFloat) {
      this.statusCoords.textContent = '—';
    }
  }

  private capturePointer(pointerId: number): void {
    try {
      this.view.setPointerCapture(pointerId);
    } catch (error) {
      console.warn('No se pudo capturar el puntero.', error);
    }
  }

  private releasePointer(pointerId: number): void {
    try {
      if (this.view.hasPointerCapture(pointerId)) {
        this.view.releasePointerCapture(pointerId);
      }
    } catch (error) {
      console.warn('No se pudo liberar el puntero.', error);
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const isField = isEditingElement(target);
    if (isField) {
      if (event.key === 'Escape' && target) {
        target.blur();
      }
      return;
    }

    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (modifier) {
      if (key === 's') {
        event.preventDefault();
        this.requestSave();
      }
      return;
    }

    if (event.code === 'Space') {
      if (!this.spaceDown) {
        this.spaceDown = true;
        this.updateCursor();
      }
      event.preventDefault();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (this.floating) {
        this.commitFloat();
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.floating) {
        this.cancelFloat();
      }
      this.selecting = false;
      this.selectBase = null;
      this.selectPreview = null;
      this.selection = null;
      this.updateSelectionUi();
      this.updateStatusInfo();
      this.needsRender = true;
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.deleteSelection();
      return;
    }

    if (event.key.startsWith('Arrow')) {
      if (!this.selection) {
        return;
      }
      event.preventDefault();
      const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
      this.nudgeSelection(dx, dy);
      return;
    }

    if (key === 'x') {
      event.preventDefault();
      this.swapColors();
      return;
    }

    if (key === '[' || key === ']') {
      event.preventDefault();
      this.setBrushSize(this.prefs.brushSize + (key === ']' ? 1 : -1));
      return;
    }

    if (key === '+' || key === '=') {
      event.preventDefault();
      this.stepZoom(1);
      return;
    }

    if (key === '-') {
      event.preventDefault();
      this.stepZoom(-1);
      return;
    }

    if (key === '0') {
      event.preventDefault();
      this.fitToView();
      return;
    }

    if (key === '1') {
      event.preventDefault();
      this.resetZoom();
      return;
    }

    const tool = TOOL_SHORTCUTS[key];
    if (tool) {
      event.preventDefault();
      this.setTool(tool);
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      this.spaceDown = false;
      this.updateCursor();
    }
  }

  private beginStrokeVersion(): void {
    this.strokeVersion = (this.strokeVersion + 1) >>> 0;
    if (this.strokeVersion === 0) {
      this.strokeMask.fill(0);
      this.strokeVersion = 1;
    }
  }

  private brushContains(i: number, j: number, size: number): boolean {
    if (this.prefs.brushShape === 'square' || size <= 2) {
      return true;
    }
    const center = (size - 1) / 2;
    const dx = i - center;
    const dy = j - center;
    const radius = size / 2 - 0.35;
    return dx * dx + dy * dy <= radius * radius;
  }

  private stampAt(x: number, y: number, erase: boolean, color: Rgb, alpha: number): void {
    if (!this.buffer) {
      return;
    }
    const size = this.prefs.brushSize;
    const start = -Math.floor(size / 2);
    for (let j = 0; j < size; j += 1) {
      for (let i = 0; i < size; i += 1) {
        if (!this.brushContains(i, j, size)) {
          continue;
        }
        const px = x + start + i;
        const py = y + start + j;
        if (px < 0 || py < 0 || px >= this.width || py >= this.height) {
          continue;
        }
        if (!this.isPaintAllowed(px, py)) {
          continue;
        }
        const index = py * this.width + px;
        if (this.strokeMask[index] === this.strokeVersion) {
          continue;
        }
        this.strokeMask[index] = this.strokeVersion;
        this.strokeChanged = true;
        if (erase) {
          this.erasePixel(px, py, alpha);
        } else {
          this.blendPixel(px, py, color, alpha);
        }
      }
    }
  }

  private paintLine(from: Point, to: Point, erase: boolean, color: Rgb, alpha: number): void {
    let x = from.x;
    let y = from.y;
    const targetX = to.x;
    const targetY = to.y;
    const dx = Math.abs(targetX - x);
    const dy = Math.abs(targetY - y);
    const stepX = x < targetX ? 1 : -1;
    const stepY = y < targetY ? 1 : -1;
    let error = dx - dy;
    while (true) {
      this.stampAt(x, y, erase, color, alpha);
      if (x === targetX && y === targetY) {
        break;
      }
      const doubled = error * 2;
      if (doubled > -dy) {
        error -= dy;
        x += stepX;
      }
      if (doubled < dx) {
        error += dx;
        y += stepY;
      }
    }
  }

  private blendPixel(x: number, y: number, color: Rgb, alpha: number): void {
    if (!this.buffer) {
      return;
    }
    const data = this.buffer.data;
    const index = (y * this.width + x) * 4;
    const sourceAlpha = clamp(alpha, 0, 1);
    if (sourceAlpha <= 0) {
      return;
    }
    const destAlpha = data[index + 3] / 255;
    const outAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha);
    if (outAlpha <= 0) {
      data[index] = 0;
      data[index + 1] = 0;
      data[index + 2] = 0;
      data[index + 3] = 0;
      return;
    }
    data[index] = (color.r * sourceAlpha + data[index] * destAlpha * (1 - sourceAlpha)) / outAlpha;
    data[index + 1] = (color.g * sourceAlpha + data[index + 1] * destAlpha * (1 - sourceAlpha)) / outAlpha;
    data[index + 2] = (color.b * sourceAlpha + data[index + 2] * destAlpha * (1 - sourceAlpha)) / outAlpha;
    data[index + 3] = outAlpha * 255;
  }

  private erasePixel(x: number, y: number, alpha: number): void {
    if (!this.buffer) {
      return;
    }
    const data = this.buffer.data;
    const index = (y * this.width + x) * 4;
    const current = data[index + 3] / 255;
    const next = current * (1 - clamp(alpha, 0, 1));
    if (next <= 0.002) {
      data[index] = 0;
      data[index + 1] = 0;
      data[index + 2] = 0;
      data[index + 3] = 0;
    } else {
      data[index + 3] = next * 255;
    }
  }

  private updatePixelStroke(point: Point, shift: boolean): void {
    if (!this.buffer || !this.strokeBase) {
      return;
    }
    const moved = point.x !== this.lastPaint.x || point.y !== this.lastPaint.y;
    if (shift) {
      this.strokeStraight = true;
      this.buffer.data.set(this.strokeBase.data);
      this.strokeChanged = false;
      this.beginStrokeVersion();
      this.paintLine(this.strokeStart, point, this.strokeErase, this.strokeColor, this.strokeAlpha);
      if (moved) {
        this.strokePath.push({ ...point });
      }
      this.lastPaint = point;
      this.syncDoc();
      this.needsRender = true;
      return;
    }
    if (this.strokeStraight) {
      this.strokeStraight = false;
      if (moved) {
        this.strokePath.push({ ...point });
      }
      this.buffer.data.set(this.strokeBase.data);
      this.strokeChanged = false;
      this.beginStrokeVersion();
      for (let i = 1; i < this.strokePath.length; i += 1) {
        this.paintLine(
          this.strokePath[i - 1],
          this.strokePath[i],
          this.strokeErase,
          this.strokeColor,
          this.strokeAlpha
        );
      }
      this.lastPaint = point;
      this.syncDoc();
      this.needsRender = true;
      return;
    }
    if (!moved) {
      return;
    }
    this.paintLine(this.lastPaint, point, this.strokeErase, this.strokeColor, this.strokeAlpha);
    this.strokePath.push({ ...point });
    this.lastPaint = point;
    this.syncDoc();
    this.needsRender = true;
  }

  private updateShape(point: Point, shift = false, alt = false): void {
    if (!this.dragBase || !this.buffer) {
      return;
    }
    this.buffer.data.set(this.dragBase.data);
    this.strokeChanged = false;
    this.beginStrokeVersion();
    this.rasterizeShape(this.strokeTool, this.strokeStart, point, shift, alt);
    this.syncDoc();
    this.needsRender = true;
  }

  private rasterizeShape(tool: PaintTool, from: Point, to: Point, shift: boolean, alt: boolean): void {
    if (tool === 'line') {
      const snappedEnd = shift ? this.snapLinePoint(from, to) : to;
      const lineStart = alt
        ? { x: from.x * 2 - snappedEnd.x, y: from.y * 2 - snappedEnd.y }
        : from;
      this.paintLine(lineStart, snappedEnd, this.strokeErase, this.strokeColor, this.strokeAlpha);
      return;
    }
    const bounds = this.constrainedRect(from, to, shift, alt);
    const x0 = bounds.x;
    const x1 = bounds.x + bounds.w - 1;
    const y0 = bounds.y;
    const y1 = bounds.y + bounds.h - 1;
    const thickness = this.prefs.brushSize;
    const fill = this.prefs.shapeFill;

    if (tool === 'rect') {
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          if (!fill) {
            const innerX0 = x0 + thickness;
            const innerX1 = x1 - thickness;
            const innerY0 = y0 + thickness;
            const innerY1 = y1 - thickness;
            if (x >= innerX0 && x <= innerX1 && y >= innerY0 && y <= innerY1) {
              continue;
            }
          }
          this.paintShapePixel(x, y);
        }
      }
      return;
    }

    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const rx = (x1 - x0) / 2 + 0.5;
    const ry = (y1 - y0) / 2 + 0.5;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        if (nx * nx + ny * ny > 1) {
          continue;
        }
        if (!fill) {
          const innerRx = rx - thickness;
          const innerRy = ry - thickness;
          if (innerRx > 0 && innerRy > 0) {
            const ix = (x - cx) / innerRx;
            const iy = (y - cy) / innerRy;
            if (ix * ix + iy * iy <= 1) {
              continue;
            }
          }
        }
        this.paintShapePixel(x, y);
      }
    }
  }

  private paintShapePixel(x: number, y: number): void {
    if (!this.buffer || x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return;
    }
    if (!this.isPaintAllowed(x, y)) {
      return;
    }
    const index = y * this.width + x;
    if (this.strokeMask[index] === this.strokeVersion) {
      return;
    }
    this.strokeMask[index] = this.strokeVersion;
    this.strokeChanged = true;
    if (this.strokeErase) {
      this.erasePixel(x, y, this.strokeAlpha);
    } else {
      this.blendPixel(x, y, this.strokeColor, this.strokeAlpha);
    }
  }

  private floodFill(startX: number, startY: number, color: Rgb, alpha: number): boolean {
    if (!this.buffer || !this.isPaintAllowed(startX, startY)) {
      return false;
    }
    const data = this.buffer.data;
    const startIndex = (startY * this.width + startX) * 4;
    if (
      Math.round(color.r) === data[startIndex] &&
      Math.round(color.g) === data[startIndex + 1] &&
      Math.round(color.b) === data[startIndex + 2] &&
      Math.round(alpha * 255) === data[startIndex + 3]
    ) {
      return false;
    }
    const tolerance = Math.round((this.prefs.tolerance / 100) * 255);
    const targetR = data[startIndex];
    const targetG = data[startIndex + 1];
    const targetB = data[startIndex + 2];
    const targetA = data[startIndex + 3];

    const matches = (x: number, y: number): boolean => {
      if (!this.isPaintAllowed(x, y)) {
        return false;
      }
      const index = (y * this.width + x) * 4;
      return (
        Math.abs(data[index] - targetR) <= tolerance &&
        Math.abs(data[index + 1] - targetG) <= tolerance &&
        Math.abs(data[index + 2] - targetB) <= tolerance &&
        Math.abs(data[index + 3] - targetA) <= tolerance
      );
    };

    let changed = false;

    if (!this.prefs.contiguous) {
      for (let y = 0; y < this.height; y += 1) {
        for (let x = 0; x < this.width; x += 1) {
          if (matches(x, y)) {
            this.blendPixel(x, y, color, alpha);
            changed = true;
          }
        }
      }
    } else {
      const visited = new Uint8Array(this.width * this.height);
      const stack: number[] = [startY * this.width + startX];
      while (stack.length > 0) {
        const index = stack.pop();
        if (index === undefined || visited[index] === 1) {
          continue;
        }
        const y = Math.floor(index / this.width);
        let x = index % this.width;
        if (!matches(x, y)) {
          continue;
        }
        let left = x;
        while (left > 0 && visited[y * this.width + left - 1] === 0 && matches(left - 1, y)) {
          left -= 1;
        }
        let right = x;
        while (
          right < this.width - 1 &&
          visited[y * this.width + right + 1] === 0 &&
          matches(right + 1, y)
        ) {
          right += 1;
        }
        for (let px = left; px <= right; px += 1) {
          visited[y * this.width + px] = 1;
          this.blendPixel(px, y, color, alpha);
        }
        changed = true;
        for (let px = left; px <= right; px += 1) {
          if (y > 0) {
            const up = (y - 1) * this.width + px;
            if (visited[up] === 0 && matches(px, y - 1)) {
              stack.push(up);
            }
          }
          if (y < this.height - 1) {
            const down = (y + 1) * this.width + px;
            if (visited[down] === 0 && matches(px, y + 1)) {
              stack.push(down);
            }
          }
        }
        x = left;
      }
    }

    if (changed) {
      this.syncDoc();
      this.needsRender = true;
    }
    return changed;
  }

  private pickColor(point: Point, button: ColorButton): void {
    if (!this.buffer) {
      return;
    }
    const index = (point.y * this.width + point.x) * 4;
    const data = this.buffer.data;
    if (data[index + 3] === 0) {
      return;
    }
    const hex = rgbToHex({ r: data[index], g: data[index + 1], b: data[index + 2] });
    if (button === 'secondary') {
      this.setSecondary(hex);
    } else {
      this.setPrimary(hex, true);
    }
    this.showToast(this.t('toast.picked', { hex }));
  }

  private startSelection(point: Point, shape: 'rect' | 'ellipse' = 'rect', mode: SelectionMode = 'replace'): void {
    this.selecting = true;
    this.selectShape = shape;
    this.selectMode = mode;
    this.selectBase = this.selection ? this.cloneSelection(this.selection) : null;
    this.selectAnchor = point;
    this.selectPreview = { x: point.x, y: point.y, w: 1, h: 1 };
    this.updateStatusInfo();
    this.needsRender = true;
  }

  private rectFromPoints(a: Point, b: Point): Rect {
    const x0 = Math.min(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  private constrainedRect(anchor: Point, point: Point, shift: boolean, alt: boolean): Rect {
    const dx = point.x - anchor.x;
    const dy = point.y - anchor.y;
    if (alt) {
      const halfX = Math.abs(dx);
      const halfY = Math.abs(dy);
      const half = shift ? Math.max(halfX, halfY) : 0;
      const width = shift ? half * 2 + 1 : halfX * 2 + 1;
      const height = shift ? half * 2 + 1 : halfY * 2 + 1;
      return {
        x: anchor.x - (shift ? half : halfX),
        y: anchor.y - (shift ? half : halfY),
        w: width,
        h: height
      };
    }
    if (shift) {
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      const signX = dx === 0 ? 1 : Math.sign(dx);
      const signY = dy === 0 ? 1 : Math.sign(dy);
      return this.rectFromPoints(anchor, {
        x: anchor.x + signX * side,
        y: anchor.y + signY * side
      });
    }
    return this.rectFromPoints(anchor, point);
  }

  private snapLinePoint(start: Point, end: Point): Point {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (dx === 0 && dy === 0) {
      return { ...end };
    }
    const step = Math.PI / 4;
    const octant = ((Math.round(Math.atan2(dy, dx) / step) % 8) + 8) % 8;
    if (octant === 0 || octant === 4) {
      return { x: end.x, y: start.y };
    }
    if (octant === 2 || octant === 6) {
      return { x: start.x, y: end.y };
    }
    const length = Math.max(1, Math.round(Math.hypot(dx, dy) / Math.SQRT2));
    const signX = dx >= 0 ? 1 : -1;
    const signY = dy >= 0 ? 1 : -1;
    return {
      x: start.x + signX * length,
      y: start.y + signY * length
    };
  }

  private pointInRect(point: Point, rect: Rect): boolean {
    return point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.w && point.y < rect.y + rect.h;
  }

  private clampSelection(rect: Rect): Rect | null {
    const x0 = clamp(rect.x, 0, this.width);
    const y0 = clamp(rect.y, 0, this.height);
    const x1 = clamp(rect.x + rect.w, 0, this.width);
    const y1 = clamp(rect.y + rect.h, 0, this.height);
    if (x1 <= x0 || y1 <= y0) {
      return null;
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  private selectionFromRect(rect: Rect): SelectionState | null {
    const bounds = this.clampSelection(rect);
    return bounds ? { kind: 'rect', bounds, mask: null } : null;
  }

  private buildEllipseSelection(bounds: Rect): SelectionState | null {
    const clamped = this.clampSelection(bounds);
    if (!clamped) {
      return null;
    }
    const mask = new Uint8Array(this.width * this.height);
    const x0 = clamped.x;
    const y0 = clamped.y;
    const x1 = clamped.x + clamped.w - 1;
    const y1 = clamped.y + clamped.h - 1;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const rx = (x1 - x0) / 2 + 0.5;
    const ry = (y1 - y0) / 2 + 0.5;
    let minX = this.width;
    let minY = this.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        if (nx * nx + ny * ny > 1) {
          continue;
        }
        mask[y * this.width + x] = 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < minX) {
      return null;
    }
    return {
      kind: 'mask',
      bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
      mask
    };
  }

  private cloneSelection(selection: SelectionState): SelectionState {
    return {
      kind: selection.kind,
      bounds: { ...selection.bounds },
      mask: selection.mask ? new Uint8Array(selection.mask) : null
    };
  }

  private selectionFromShape(rect: Rect, shape: 'rect' | 'ellipse'): SelectionState | null {
    return shape === 'ellipse' ? this.buildEllipseSelection(rect) : this.selectionFromRect(rect);
  }

  private selectionHasPoint(selection: SelectionState, x: number, y: number): boolean {
    if (!this.pointInRect({ x, y }, selection.bounds)) {
      return false;
    }
    if (selection.kind === 'rect') {
      return true;
    }
    return selection.mask !== null && selection.mask[y * this.width + x] === 1;
  }

  private combineSelection(
    base: SelectionState | null,
    addition: SelectionState | null,
    mode: SelectionMode
  ): SelectionState | null {
    if (mode === 'replace') {
      return addition ? this.cloneSelection(addition) : null;
    }
    if (!base) {
      return mode === 'add' && addition ? this.cloneSelection(addition) : null;
    }
    if (!addition) {
      return this.cloneSelection(base);
    }
    const x0 = Math.max(0, Math.min(base.bounds.x, addition.bounds.x));
    const y0 = Math.max(0, Math.min(base.bounds.y, addition.bounds.y));
    const x1 = Math.min(this.width, Math.max(base.bounds.x + base.bounds.w, addition.bounds.x + addition.bounds.w));
    const y1 = Math.min(this.height, Math.max(base.bounds.y + base.bounds.h, addition.bounds.y + addition.bounds.h));
    const mask = new Uint8Array(this.width * this.height);
    let minX = this.width;
    let minY = this.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const inBase = this.selectionHasPoint(base, x, y);
        const inAddition = this.selectionHasPoint(addition, x, y);
        const keep = mode === 'add' ? inBase || inAddition : inBase && !inAddition;
        if (!keep) {
          continue;
        }
        mask[y * this.width + x] = 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < minX || maxY < minY) {
      return null;
    }
    return {
      kind: 'mask',
      bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
      mask
    };
  }

  private isPaintAllowed(x: number, y: number): boolean {
    const selection = this.selection;
    if (!selection) {
      return true;
    }
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return false;
    }
    if (selection.kind === 'rect') {
      return (
        x >= selection.bounds.x &&
        y >= selection.bounds.y &&
        x < selection.bounds.x + selection.bounds.w &&
        y < selection.bounds.y + selection.bounds.h
      );
    }
    return selection.mask !== null && selection.mask[y * this.width + x] === 1;
  }

  private selectAll(): void {
    if (!this.buffer) {
      return;
    }
    if (this.floating) {
      this.commitFloat();
    }
    this.selection = {
      kind: 'rect',
      bounds: { x: 0, y: 0, w: this.width, h: this.height },
      mask: null
    };
    this.updateSelectionUi();
    this.updateStatusInfo();
    this.needsRender = true;
  }

  private deselect(): void {
    if (this.floating) {
      this.commitFloat();
    }
    this.selection = null;
    this.updateSelectionUi();
    this.updateStatusInfo();
    this.needsRender = true;
  }

  private selectWand(point: Point, mode: SelectionMode = 'replace'): void {
    if (!this.buffer) {
      return;
    }
    const data = this.buffer.data;
    const startIndex = point.y * this.width + point.x;
    const startOffset = startIndex * 4;
    const targetR = data[startOffset];
    const targetG = data[startOffset + 1];
    const targetB = data[startOffset + 2];
    const targetA = data[startOffset + 3];
    const visited = new Uint8Array(this.width * this.height);
    const mask = new Uint8Array(this.width * this.height);
    let minX = this.width;
    let minY = this.height;
    let maxX = -1;
    let maxY = -1;
    const stack: number[] = [startIndex];

    while (stack.length > 0) {
      const index = stack.pop();
      if (index === undefined || visited[index] === 1) {
        continue;
      }
      visited[index] = 1;
      const offset = index * 4;
      if (
        data[offset] !== targetR ||
        data[offset + 1] !== targetG ||
        data[offset + 2] !== targetB ||
        data[offset + 3] !== targetA
      ) {
        continue;
      }
      mask[index] = 1;
      const x = index % this.width;
      const y = Math.floor(index / this.width);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (x > 0) stack.push(index - 1);
      if (x < this.width - 1) stack.push(index + 1);
      if (y > 0) stack.push(index - this.width);
      if (y < this.height - 1) stack.push(index + this.width);
    }

    const addition: SelectionState | null =
      maxX < minX
        ? null
        : {
            kind: 'mask',
            bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
            mask
          };
    this.selection = this.combineSelection(this.selection, addition, mode);
    this.updateSelectionUi();
    this.updateStatusInfo();
    this.needsRender = true;
  }

  private extractRect(rect: Rect): ImageData {
    const output = new ImageData(rect.w, rect.h);
    if (!this.buffer) {
      return output;
    }
    for (let y = 0; y < rect.h; y += 1) {
      const sourceStart = ((rect.y + y) * this.width + rect.x) * 4;
      output.data.set(this.buffer.data.subarray(sourceStart, sourceStart + rect.w * 4), y * rect.w * 4);
    }
    return output;
  }

  private clearPixels(rect: Rect): void {
    if (!this.buffer) {
      return;
    }
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      const start = (y * this.width + rect.x) * 4;
      this.buffer.data.fill(0, start, start + rect.w * 4);
    }
  }

  private extractSelection(selection: SelectionState): { data: ImageData; mask: Uint8Array | null } {
    const bounds = selection.bounds;
    if (selection.kind === 'rect' || !selection.mask) {
      return { data: this.extractRect(bounds), mask: null };
    }
    const data = new ImageData(bounds.w, bounds.h);
    const mask = new Uint8Array(bounds.w * bounds.h);
    if (!this.buffer) {
      return { data, mask };
    }
    for (let y = 0; y < bounds.h; y += 1) {
      for (let x = 0; x < bounds.w; x += 1) {
        const sourceIndex = (bounds.y + y) * this.width + bounds.x + x;
        if (selection.mask[sourceIndex] !== 1) {
          continue;
        }
        mask[y * bounds.w + x] = 1;
        const sourceOffset = sourceIndex * 4;
        const targetOffset = (y * bounds.w + x) * 4;
        data.data[targetOffset] = this.buffer.data[sourceOffset];
        data.data[targetOffset + 1] = this.buffer.data[sourceOffset + 1];
        data.data[targetOffset + 2] = this.buffer.data[sourceOffset + 2];
        data.data[targetOffset + 3] = this.buffer.data[sourceOffset + 3];
      }
    }
    return { data, mask };
  }

  private clearSelectionPixels(selection: SelectionState): void {
    if (!this.buffer) {
      return;
    }
    const bounds = selection.bounds;
    if (selection.kind === 'rect' || !selection.mask) {
      this.clearPixels(bounds);
      return;
    }
    const data = this.buffer.data;
    for (let y = bounds.y; y < bounds.y + bounds.h; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.w; x += 1) {
        const index = y * this.width + x;
        if (selection.mask[index] !== 1) {
          continue;
        }
        const offset = index * 4;
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
        data[offset + 3] = 0;
      }
    }
  }

  private selectionFromFloat(floating: FloatingSelection): SelectionState | null {
    if (!floating.mask) {
      return this.selectionFromRect({ x: floating.x, y: floating.y, w: floating.w, h: floating.h });
    }
    const mask = new Uint8Array(this.width * this.height);
    let minX = this.width;
    let minY = this.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < floating.h; y += 1) {
      for (let x = 0; x < floating.w; x += 1) {
        if (floating.mask[y * floating.w + x] !== 1) {
          continue;
        }
        const px = floating.x + x;
        const py = floating.y + y;
        if (px < 0 || py < 0 || px >= this.width || py >= this.height) {
          continue;
        }
        mask[py * this.width + px] = 1;
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
    }
    if (maxX < minX) {
      return null;
    }
    return {
      kind: 'mask',
      bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
      mask
    };
  }

  private beginFloat(): void {
    if (this.floating || !this.selection || !this.buffer) {
      return;
    }
    let selection = this.selection;
    if (selection.kind === 'rect') {
      const bounds = this.clampSelection(selection.bounds);
      if (!bounds) {
        return;
      }
      selection = { ...selection, bounds };
    }
    this.preFloat = this.cloneBuffer();
    this.preFloatSelection = this.cloneSelection(selection);
    const extracted = this.extractSelection(selection);
    const canvas = createCanvas(selection.bounds.w, selection.bounds.h);
    const ctx = context2d(canvas);
    ctx.putImageData(extracted.data, 0, 0);
    this.clearSelectionPixels(selection);
    this.floating = {
      canvas,
      ctx,
      x: selection.bounds.x,
      y: selection.bounds.y,
      w: selection.bounds.w,
      h: selection.bounds.h,
      mask: extracted.mask
    };
    this.selection = null;
    this.syncDoc();
    this.updateDirty();
    this.updateSelectionUi();
    this.updateStatusInfo();
    this.needsRender = true;
  }

  private startFloatDrag(point: Point): void {
    if (!this.floating) {
      return;
    }
    this.dragFloat = true;
    this.floatDragOrigin = point;
    this.floatStart = { x: this.floating.x, y: this.floating.y };
  }

  private commitFloat(): void {
    const floating = this.floating;
    if (!floating || !this.buffer) {
      return;
    }
    const data = floating.ctx.getImageData(0, 0, floating.w, floating.h).data;
    for (let y = 0; y < floating.h; y += 1) {
      for (let x = 0; x < floating.w; x += 1) {
        const index = (y * floating.w + x) * 4;
        const alpha = data[index + 3] / 255;
        if (alpha <= 0) {
          continue;
        }
        this.blendPixel(floating.x + x, floating.y + y, {
          r: data[index],
          g: data[index + 1],
          b: data[index + 2]
        }, alpha);
      }
    }
    this.selection = this.selectionFromFloat(floating);
    this.floating = null;
    this.preFloat = null;
    this.preFloatSelection = null;
    this.syncDoc();
    this.pushHistory();
    this.updateSelectionUi();
    this.updateStatusInfo();
    this.needsRender = true;
  }

  private cancelFloat(): void {
    if (!this.floating || !this.preFloat) {
      return;
    }
    if (this.buffer) {
      this.buffer.data.set(this.preFloat.data);
    }
    this.selection = this.preFloatSelection ? this.cloneSelection(this.preFloatSelection) : null;
    this.floating = null;
    this.preFloat = null;
    this.preFloatSelection = null;
    this.syncDoc();
    this.updateDirty();
    this.updateSelectionUi();
    this.updateStatusInfo();
    this.needsRender = true;
  }

  private copySelection(): void {
    if (!this.buffer) {
      return;
    }
    let source: Rect | null = null;
    let data: ImageData | null = null;
    let mask: Uint8Array | null = null;
    if (this.floating) {
      source = { x: this.floating.x, y: this.floating.y, w: this.floating.w, h: this.floating.h };
      data = this.floating.ctx.getImageData(0, 0, this.floating.w, this.floating.h);
      mask = this.floating.mask ? new Uint8Array(this.floating.mask) : null;
    } else if (this.selection) {
      const extracted = this.extractSelection(this.selection);
      source = this.selection.bounds;
      data = extracted.data;
      mask = extracted.mask;
    } else {
      source = { x: 0, y: 0, w: this.width, h: this.height };
      data = this.extractRect(source);
    }
    if (!source || !data) {
      return;
    }
    this.clipboard = {
      w: data.width,
      h: data.height,
      data: new Uint8ClampedArray(data.data),
      originX: source.x,
      originY: source.y,
      mask
    };
    this.updateSelectionUi();
    this.showToast(this.t('toast.copied'));
  }

  private cutSelection(): void {
    if (!this.buffer) {
      return;
    }
    if (this.floating) {
      this.copySelection();
      this.floating = null;
      this.preFloat = null;
      this.preFloatSelection = null;
      this.pushHistory();
      this.updateSelectionUi();
      this.updateStatusInfo();
      this.needsRender = true;
      return;
    }
    if (!this.selection) {
      return;
    }
    this.copySelection();
    this.clearSelectionPixels(this.selection);
    this.syncDoc();
    this.pushHistory();
    this.updateStatusInfo();
    this.needsRender = true;
  }

  private deleteSelection(): void {
    if (!this.buffer) {
      return;
    }
    if (this.floating) {
      this.floating = null;
      this.preFloat = null;
      this.preFloatSelection = null;
      this.pushHistory();
      this.updateSelectionUi();
      this.updateStatusInfo();
      this.needsRender = true;
      return;
    }
    if (!this.selection) {
      return;
    }
    this.clearSelectionPixels(this.selection);
    this.syncDoc();
    this.pushHistory();
    this.updateStatusInfo();
    this.needsRender = true;
  }

  private pasteClipboard(): void {
    if (!this.clipboard || !this.buffer) {
      return;
    }
    if (this.floating) {
      this.commitFloat();
    }
    const source = this.clipboard;
    this.preFloat = this.cloneBuffer();
    this.preFloatSelection = this.selection ? this.cloneSelection(this.selection) : null;
    const canvas = createCanvas(source.w, source.h);
    const ctx = context2d(canvas);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(source.data), source.w, source.h), 0, 0);
    let x = this.selection ? this.selection.bounds.x : source.originX;
    let y = this.selection ? this.selection.bounds.y : source.originY;
    x = clamp(x, 0, Math.max(0, this.width - 1));
    y = clamp(y, 0, Math.max(0, this.height - 1));
    this.floating = {
      canvas,
      ctx,
      x,
      y,
      w: source.w,
      h: source.h,
      mask: source.mask ? new Uint8Array(source.mask) : null
    };
    this.selection = null;
    this.syncDoc();
    this.updateDirty();
    this.updateSelectionUi();
    this.updateStatusInfo();
    this.needsRender = true;
    this.showToast(this.t('toast.pasted'));
  }

  private nudgeSelection(dx: number, dy: number): void {
    if (!this.buffer) {
      return;
    }
    if (!this.floating && this.selection) {
      this.beginFloat();
    }
    if (!this.floating) {
      return;
    }
    this.floating.x += dx;
    this.floating.y += dy;
    this.updateStatusInfo();
    this.needsRender = true;
  }

  private updateSelectionUi(): void {
    const hasSelection = this.selection !== null || this.floating !== null;
    this.selectNoneButton.disabled = !hasSelection;
    this.selectCopyButton.disabled = !this.buffer;
    this.selectCutButton.disabled = !hasSelection;
    this.selectDeleteButton.disabled = !hasSelection;
    this.selectPasteButton.disabled = this.clipboard === null;
    this.selectAllButton.disabled = !this.buffer;
  }

  private cloneBuffer(): ImageData {
    if (!this.buffer) {
      return new ImageData(1, 1);
    }
    return cloneImageData(this.buffer);
  }

  private syncDoc(): void {
    if (!this.docCtx || !this.buffer) {
      return;
    }
    this.docCtx.putImageData(this.buffer, 0, 0);
    this.needsRender = true;
    this.previewDirty = true;
    this.updateSheetPreviewLabel();
  }

  private resetHistory(): void {
    this.history = [this.cloneBuffer()];
    this.historyIndex = 0;
    this.savedIndex = 0;
    this.lastDirty = false;
    this.updateHistoryUi();
    this.updateDirty();
  }

  private pushHistory(): void {
    if (!this.buffer) {
      return;
    }
    const snapshot = cloneImageData(this.buffer);
    this.history.length = this.historyIndex + 1;
    this.history.push(snapshot);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
      if (this.savedIndex > 0) {
        this.savedIndex -= 1;
      } else {
        this.savedIndex = -1;
      }
    }
    this.historyIndex = this.history.length - 1;
    this.updateHistoryUi();
    this.updateDirty();
  }

  private undo(): void {
    if (this.floating) {
      this.cancelFloat();
      return;
    }
    if (this.historyIndex <= 0) {
      return;
    }
    this.historyIndex -= 1;
    this.restoreHistory();
  }

  private redo(): void {
    if (this.floating) {
      return;
    }
    if (this.historyIndex >= this.history.length - 1) {
      return;
    }
    this.historyIndex += 1;
    this.restoreHistory();
  }

  private restoreHistory(): void {
    const snapshot = this.history[this.historyIndex];
    if (!snapshot) {
      return;
    }
    if (!this.buffer || snapshot.width !== this.width || snapshot.height !== this.height) {
      this.width = snapshot.width;
      this.height = snapshot.height;
      this.docCanvas = createCanvas(this.width, this.height);
      this.docCtx = context2d(this.docCanvas);
      this.buffer = new ImageData(new Uint8ClampedArray(snapshot.data), this.width, this.height);
      this.docCtx.putImageData(this.buffer, 0, 0);
      this.strokeMask = new Uint32Array(this.width * this.height);
      this.maxHistory = clamp(Math.floor(80000000 / (this.width * this.height * 4)), 2, MAX_HISTORY);
      this.selection = null;
      this.floating = null;
      this.preFloat = null;
      this.preFloatSelection = null;
      this.imageSize.textContent = `${this.width} × ${this.height}`;
      this.resizeW.value = String(this.width);
      this.resizeH.value = String(this.height);
      this.prefs.cellW = clamp(this.prefs.cellW, 1, this.width);
      this.prefs.cellH = clamp(this.prefs.cellH, 1, this.height);
      this.prefs.frameStart = 0;
      this.prefs.frameEnd = Math.max(0, this.metrics().frames - 1);
      this.frameIndex = 0;
      this.updateSheetUi();
      this.fitPreview();
      this.fitToView();
      this.pendingFit = false;
      this.updateSelectionUi();
      this.previewDirty = true;
    } else {
      this.buffer.data.set(snapshot.data);
      this.syncDoc();
    }
    this.updateHistoryUi();
    this.updateDirty();
    this.updateStatusInfo();
    this.needsRender = true;
  }

  private updateHistoryUi(): void {
    this.undoButton.disabled = !this.buffer || (this.historyIndex <= 0 && !this.floating);
    this.redoButton.disabled = !this.buffer || this.floating !== null || this.historyIndex >= this.history.length - 1;
  }

  private updateDirty(): void {
    const dirty = this.buffer !== null && (this.historyIndex !== this.savedIndex || this.floating !== null);
    if (dirty !== this.lastDirty) {
      this.lastDirty = dirty;
      vscode.postMessage({ type: 'dirty', dirty });
    }
    this.updateHistoryUi();
  }

  private finishForSerialize(): void {
    if (this.strokeActive) {
      this.strokeActive = false;
      this.dragBase = null;
      this.strokeBase = null;
      this.strokePath = [];
      this.strokeStraight = false;
      if (this.strokeChanged) {
        this.pushHistory();
      }
      this.strokeChanged = false;
    }
    this.selecting = false;
    this.selectBase = null;
    this.selectPreview = null;
    this.dragFloat = false;
    this.panning = false;
    if (this.floating) {
      this.commitFloat();
    }
    this.syncDoc();
  }

  private serialize(id: number): void {
    if (!this.docCanvas) {
      vscode.postMessage({ type: 'serialized', id, dataUrl: '', historyIndex: -1 });
      return;
    }
    this.finishForSerialize();
    const dataUrl = this.docCanvas.toDataURL('image/png');
    vscode.postMessage({ type: 'serialized', id, dataUrl, historyIndex: this.historyIndex });
  }

  private requestSave(): void {
    if (this.floating) {
      this.commitFloat();
    }
    this.syncDoc();
    vscode.postMessage({ type: 'save' });
  }

  private resizeImage(): void {
    if (!this.buffer) {
      return;
    }
    const nextW = coerceInt(this.resizeW.value, 1, 4096, this.width);
    const nextH = coerceInt(this.resizeH.value, 1, 4096, this.height);
    if (nextW === this.width && nextH === this.height) {
      return;
    }
    if (this.floating) {
      this.commitFloat();
    }
    const source = createCanvas(this.width, this.height);
    context2d(source).putImageData(this.buffer, 0, 0);
    const target = createCanvas(nextW, nextH);
    const targetCtx = context2d(target);
    targetCtx.imageSmoothingEnabled = false;
    targetCtx.drawImage(source, 0, 0, nextW, nextH);
    this.width = nextW;
    this.height = nextH;
    this.docCanvas = createCanvas(nextW, nextH);
    this.docCtx = context2d(this.docCanvas);
    this.buffer = this.docCtx.getImageData(0, 0, nextW, nextH);
    this.buffer.data.set(targetCtx.getImageData(0, 0, nextW, nextH).data);
    this.docCtx.putImageData(this.buffer, 0, 0);
    this.strokeMask = new Uint32Array(nextW * nextH);
    this.selection = null;
    this.floating = null;
    this.preFloat = null;
    this.preFloatSelection = null;
    this.imageSize.textContent = `${nextW} × ${nextH}`;
    this.resizeW.value = String(nextW);
    this.resizeH.value = String(nextH);
    this.prefs.cellW = clamp(this.prefs.cellW, 1, nextW);
    this.prefs.cellH = clamp(this.prefs.cellH, 1, nextH);
    this.cellWInput.max = String(nextW);
    this.cellHInput.max = String(nextH);
    this.prefs.frameStart = 0;
    this.prefs.frameEnd = Math.max(0, this.metrics().frames - 1);
    this.frameIndex = 0;
    this.maxHistory = clamp(Math.floor(80000000 / (nextW * nextH * 4)), 2, MAX_HISTORY);
    this.pushHistory();
    this.updateSheetUi();
    this.fitPreview();
    this.updateSelectionUi();
    this.pendingFit = true;
    this.tryFit();
    this.needsRender = true;
  }

  private flipImage(horizontal: boolean): void {
    if (!this.buffer || !this.docCanvas) {
      return;
    }
    if (this.floating) {
      this.commitFloat();
    }
    const source = createCanvas(this.width, this.height);
    context2d(source).putImageData(this.buffer, 0, 0);
    const target = createCanvas(this.width, this.height);
    const ctx = context2d(target);
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    if (horizontal) {
      ctx.translate(this.width, 0);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(0, this.height);
      ctx.scale(1, -1);
    }
    ctx.drawImage(source, 0, 0);
    ctx.restore();
    this.buffer = ctx.getImageData(0, 0, this.width, this.height);
    this.syncDoc();
    this.pushHistory();
    this.updateStatusInfo();
    this.needsRender = true;
  }

  private clearImage(): void {
    if (!this.buffer) {
      return;
    }
    if (this.floating) {
      this.cancelFloat();
    }
    this.buffer.data.fill(0);
    this.selection = null;
    this.syncDoc();
    this.pushHistory();
    this.updateSelectionUi();
    this.updateStatusInfo();
    this.needsRender = true;
  }

  private metrics(): { cols: number; rows: number; frames: number; cellW: number; cellH: number } {
    const cellW = clamp(this.prefs.cellW, 1, Math.max(1, this.width));
    const cellH = clamp(this.prefs.cellH, 1, Math.max(1, this.height));
    const cols = Math.max(1, Math.floor(this.width / cellW));
    const rows = Math.max(1, Math.floor(this.height / cellH));
    return { cols, rows, frames: cols * rows, cellW, cellH };
  }

  private setSheetEnabled(enabled: boolean): void {
    this.prefs.sheetEnabled = enabled;
    if (!enabled) {
      this.playing = false;
    } else {
      const metrics = this.metrics();
      if (this.prefs.frameEnd <= this.prefs.frameStart && metrics.frames > 1) {
        this.prefs.frameStart = 0;
        this.prefs.frameEnd = metrics.frames - 1;
      }
      this.frameIndex = clamp(this.frameIndex, this.prefs.frameStart, this.prefs.frameEnd);
    }
    this.updateSheetUi();
    this.persistPrefs();
    this.needsRender = true;
  }

  private onCellSizeChange(axis: 'w' | 'h'): void {
    if (axis === 'w') {
      this.prefs.cellW = coerceInt(this.cellWInput.value, 1, Math.max(1, this.width), this.prefs.cellW);
      this.cellWInput.value = String(this.prefs.cellW);
    } else {
      this.prefs.cellH = coerceInt(this.cellHInput.value, 1, Math.max(1, this.height), this.prefs.cellH);
      this.cellHInput.value = String(this.prefs.cellH);
    }
    const metrics = this.metrics();
    this.prefs.frameStart = 0;
    this.prefs.frameEnd = metrics.frames - 1;
    this.frameIndex = 0;
    this.updateSheetUi();
    this.persistPrefs();
    this.needsRender = true;
  }

  private onFrameRangeChange(): void {
    const metrics = this.metrics();
    let start = coerceInt(this.frameStartInput.value, 1, metrics.frames, 1) - 1;
    let end = coerceInt(this.frameEndInput.value, 1, metrics.frames, metrics.frames) - 1;
    if (end < start) {
      const swap = start;
      start = end;
      end = swap;
    }
    this.prefs.frameStart = start;
    this.prefs.frameEnd = end;
    this.frameIndex = clamp(this.frameIndex, start, end);
    this.updateSheetUi();
    this.persistPrefs();
    this.needsRender = true;
  }

  private onFpsChange(): void {
    this.prefs.fps = coerceInt(this.fpsInput.value, 1, 60, this.prefs.fps);
    this.fpsInput.value = String(this.prefs.fps);
    this.animationAccumulator = 0;
    this.lastAnimationTime = performance.now();
    this.persistPrefs();
    this.updatePlayButton();
  }

  private updateSheetUi(): void {
    const metrics = this.metrics();
    const frames = metrics.frames;
    this.prefs.frameStart = clamp(this.prefs.frameStart, 0, Math.max(0, frames - 1));
    this.prefs.frameEnd = clamp(this.prefs.frameEnd, this.prefs.frameStart, Math.max(0, frames - 1));
    this.frameIndex = clamp(this.frameIndex, this.prefs.frameStart, this.prefs.frameEnd);

    this.sheetEnabledInput.checked = this.prefs.sheetEnabled;
    this.sheetBody.classList.toggle('disabled', !this.prefs.sheetEnabled);
    this.setInputValue(this.cellWInput, String(metrics.cellW));
    this.setInputValue(this.cellHInput, String(metrics.cellH));
    this.cellWInput.max = String(Math.max(1, this.width));
    this.cellHInput.max = String(Math.max(1, this.height));
    this.frameStartInput.max = String(frames);
    this.frameEndInput.max = String(frames);
    this.setInputValue(this.frameStartInput, String(this.prefs.frameStart + 1));
    this.setInputValue(this.frameEndInput, String(this.prefs.frameEnd + 1));
    this.setInputValue(this.fpsInput, String(this.prefs.fps));
    this.updateSheetInfoText();
    this.updatePlayButton();
    this.fitPreview();
    this.updateStatusInfo();
    this.needsRender = true;
    this.previewDirty = true;
  }

  private updateSheetInfoText(): void {
    const metrics = this.metrics();
    this.sheetInfo.textContent = this.prefs.sheetEnabled
      ? this.t('sheet.info', { cols: metrics.cols, rows: metrics.rows, frames: metrics.frames })
      : this.t('sheet.disabledInfo');
  }

  private setInputValue(element: HTMLInputElement, value: string): void {
    if (document.activeElement !== element || element.value !== value) {
      if (element.value !== value) {
        element.value = value;
      }
    }
  }

  private updatePlayButton(): void {
    const metrics = this.metrics();
    const canPlay = this.prefs.sheetEnabled && this.buffer !== null;
    this.playButton.disabled = !canPlay;
    this.prevFrameButton.disabled = !canPlay;
    this.nextFrameButton.disabled = !canPlay;
    this.playButton.textContent = this.t(this.playing ? 'play.pause' : 'play.play');
    if (!this.prefs.sheetEnabled) {
      this.playing = false;
      this.frameCounter.textContent = '—';
    } else {
      this.frameCounter.textContent = `${this.frameIndex + 1} / ${metrics.frames}`;
    }
  }

  private togglePlay(): void {
    if (!this.prefs.sheetEnabled || !this.buffer) {
      return;
    }
    const metrics = this.metrics();
    if (metrics.frames < 2) {
      this.showToast(this.t('toast.needFrames'));
      return;
    }
    this.playing = !this.playing;
    this.animationAccumulator = 0;
    this.lastAnimationTime = performance.now();
    if (this.playing && (this.frameIndex < this.prefs.frameStart || this.frameIndex > this.prefs.frameEnd)) {
      this.frameIndex = this.prefs.frameStart;
    }
    this.updatePlayButton();
    this.previewDirty = true;
    this.needsRender = true;
  }

  private stepFrame(direction: number): void {
    if (!this.prefs.sheetEnabled) {
      return;
    }
    this.playing = false;
    const start = this.prefs.frameStart;
    const end = this.prefs.frameEnd;
    let next = this.frameIndex + direction;
    if (next > end) {
      next = start;
    }
    if (next < start) {
      next = end;
    }
    this.frameIndex = next;
    this.updatePlayButton();
    this.previewDirty = true;
    this.needsRender = true;
    this.updateStatusInfo();
  }

  private stepAnimation(now: number): void {
    if (!this.prefs.sheetEnabled || !this.playing || !this.buffer) {
      this.lastAnimationTime = now;
      return;
    }
    const delta = Math.min(250, now - this.lastAnimationTime);
    this.lastAnimationTime = now;
    this.animationAccumulator += delta;
    const interval = 1000 / Math.max(1, this.prefs.fps);
    let steps = 0;
    while (this.animationAccumulator >= interval && steps < 10) {
      this.animationAccumulator -= interval;
      steps += 1;
      let next = this.frameIndex + 1;
      if (next > this.prefs.frameEnd) {
        if (this.prefs.loop) {
          next = this.prefs.frameStart;
        } else {
          this.playing = false;
          next = this.prefs.frameEnd;
        }
      }
      this.frameIndex = clamp(next, this.prefs.frameStart, this.prefs.frameEnd);
      this.previewDirty = true;
      this.needsRender = true;
      this.updatePlayButton();
      this.updateStatusInfo();
      if (!this.playing) {
        break;
      }
    }
  }

  private applyPreviewBackground(): void {
    this.previewBox.classList.toggle('checker', this.prefs.previewBg === 'checker');
    if (this.prefs.previewBg === 'checker') {
      this.previewBox.style.background = '';
    } else if (this.prefs.previewBg === 'theme') {
      this.previewBox.style.background = 'transparent';
    } else {
      this.previewBox.style.background = this.prefs.previewBg;
    }
    this.previewBgInput.value = this.prefs.previewBg;
  }

  private fitPreview(): void {
    if (!this.buffer) {
      return;
    }
    const metrics = this.metrics();
    const width = this.prefs.sheetEnabled ? metrics.cellW : this.width;
    const height = this.prefs.sheetEnabled ? metrics.cellH : this.height;
    if (this.preview.width !== width || this.preview.height !== height) {
      this.preview.width = width;
      this.preview.height = height;
    }
    const rect = this.previewBox.getBoundingClientRect();
    const availableW = Math.max(1, rect.width - 12);
    const availableH = Math.max(1, rect.height - 12);
    const raw = Math.min(availableW / width, availableH / height);
    const scale = raw >= 1 ? Math.min(16, Math.floor(raw)) : raw;
    this.preview.style.width = `${Math.max(1, Math.round(width * scale))}px`;
    this.preview.style.height = `${Math.max(1, Math.round(height * scale))}px`;
    this.previewDirty = true;
  }

  private renderPreview(): void {
    if (!this.docCanvas || !this.buffer) {
      return;
    }
    const metrics = this.metrics();
    const ctx = this.previewCtx;
    ctx.imageSmoothingEnabled = false;
    const width = this.preview.width;
    const height = this.preview.height;
    ctx.clearRect(0, 0, width, height);
    if (this.prefs.sheetEnabled) {
      this.frameIndex = clamp(this.frameIndex, this.prefs.frameStart, this.prefs.frameEnd);
      const col = this.frameIndex % metrics.cols;
      const row = Math.floor(this.frameIndex / metrics.cols);
      ctx.drawImage(
        this.docCanvas,
        col * metrics.cellW,
        row * metrics.cellH,
        metrics.cellW,
        metrics.cellH,
        0,
        0,
        width,
        height
      );
      this.frameCounter.textContent = `${this.frameIndex + 1} / ${metrics.frames}`;
    } else {
      ctx.drawImage(this.docCanvas, 0, 0, this.width, this.height, 0, 0, width, height);
      this.frameCounter.textContent = '—';
    }
  }

  private updateSheetPreviewLabel(): void {
    if (!this.prefs.sheetEnabled || !this.buffer) {
      return;
    }
    const metrics = this.metrics();
    this.frameCounter.textContent = `${this.frameIndex + 1} / ${metrics.frames}`;
  }

  private getCheckerPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
    if (!this.checkerCanvas) {
      const canvas = createCanvas(16, 16);
      const checker = context2d(canvas, false);
      checker.fillStyle = 'rgba(128, 128, 128, 0.16)';
      checker.fillRect(0, 0, 16, 16);
      checker.fillStyle = 'rgba(128, 128, 128, 0.09)';
      checker.fillRect(0, 0, 8, 8);
      checker.fillRect(8, 8, 8, 8);
      this.checkerCanvas = canvas;
    }
    if (!this.checkerPattern) {
      this.checkerPattern = ctx.createPattern(this.checkerCanvas, 'repeat');
    }
    return this.checkerPattern;
  }

  private render(): void {
    const ctx = this.viewCtx;
    const rect = this.view.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    const dpr = window.devicePixelRatio || 1;
    const backingW = Math.max(1, Math.round(cssW * dpr));
    const backingH = Math.max(1, Math.round(cssH * dpr));
    if (this.view.width !== backingW || this.view.height !== backingH) {
      this.view.width = backingW;
      this.view.height = backingH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    if (!this.buffer || !this.docCanvas) {
      return;
    }

    const imageW = this.width * this.zoom;
    const imageH = this.height * this.zoom;
    const originX = this.panX;
    const originY = this.panY;

    ctx.save();
    ctx.beginPath();
    ctx.rect(originX, originY, imageW, imageH);
    ctx.clip();
    ctx.translate(originX, originY);
    const pattern = this.getCheckerPattern(ctx);
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, imageW, imageH);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.docCanvas, 0, 0, imageW, imageH);
    if (this.floating) {
      ctx.drawImage(
        this.floating.canvas,
        this.floating.x * this.zoom,
        this.floating.y * this.zoom,
        this.floating.w * this.zoom,
        this.floating.h * this.zoom
      );
    }
    ctx.restore();

    this.drawGrid(ctx, originX, originY, imageW, imageH);
    this.drawSheet(ctx, originX, originY, imageW, imageH);
    this.drawHover(ctx, originX, originY);
    this.drawSelection(ctx, originX, originY);
    this.drawBorder(ctx, originX, originY, imageW, imageH);
  }

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    originX: number,
    originY: number,
    imageW: number,
    imageH: number
  ): void {
    if (!this.prefs.showGrid || this.zoom < 6 || this.width + this.height > 2200) {
      return;
    }
    ctx.save();
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < this.width; x += 1) {
      const px = Math.round(originX + x * this.zoom) + 0.5;
      ctx.moveTo(px, originY);
      ctx.lineTo(px, originY + imageH);
    }
    for (let y = 1; y < this.height; y += 1) {
      const py = Math.round(originY + y * this.zoom) + 0.5;
      ctx.moveTo(originX, py);
      ctx.lineTo(originX + imageW, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawSheet(
    ctx: CanvasRenderingContext2D,
    originX: number,
    originY: number,
    imageW: number,
    imageH: number
  ): void {
    if (!this.prefs.sheetEnabled) {
      return;
    }
    const metrics = this.metrics();
    const cellW = metrics.cellW * this.zoom;
    const cellH = metrics.cellH * this.zoom;
    ctx.save();
    ctx.strokeStyle = 'rgba(80, 170, 255, 0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let col = 1; col < metrics.cols; col += 1) {
      const px = Math.round(originX + col * cellW) + 0.5;
      ctx.moveTo(px, originY);
      ctx.lineTo(px, originY + imageH);
    }
    for (let row = 1; row < metrics.rows; row += 1) {
      const py = Math.round(originY + row * cellH) + 0.5;
      ctx.moveTo(originX, py);
      ctx.lineTo(originX + imageW, py);
    }
    ctx.stroke();

    if (metrics.frames > 0) {
      const col = this.frameIndex % metrics.cols;
      const row = Math.floor(this.frameIndex / metrics.cols);
      ctx.strokeStyle = 'rgba(120, 200, 255, 0.95)';
      ctx.lineWidth = 2;
      ctx.strokeRect(originX + col * cellW + 1, originY + row * cellH + 1, cellW - 2, cellH - 2);
    }

    if (cellW >= 24 && cellH >= 14 && metrics.frames <= 512) {
      ctx.font = '600 10px monospace';
      ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 2;
      for (let index = 0; index < metrics.frames; index += 1) {
        const col = index % metrics.cols;
        const row = Math.floor(index / metrics.cols);
        const inRange = index >= this.prefs.frameStart && index <= this.prefs.frameEnd;
        ctx.fillStyle = inRange ? 'rgba(190, 228, 255, 0.95)' : 'rgba(255, 255, 255, 0.45)';
        ctx.fillText(String(index + 1), originX + col * cellW + 3, originY + row * cellH + 2);
      }
    }
    ctx.restore();
  }

  private drawSelection(ctx: CanvasRenderingContext2D, originX: number, originY: number): void {
    if (this.selecting) {
      if (this.selectMode !== 'replace' && this.selectBase) {
        this.drawSelectionState(ctx, originX, originY, this.selectBase);
      }
      if (this.selectPreview) {
        if (this.selectShape === 'ellipse') {
          this.drawEllipsePreview(ctx, originX, originY, this.selectPreview);
        } else {
          this.drawRectSelection(ctx, originX, originY, this.selectPreview);
        }
      }
      return;
    }
    if (this.floating) {
      if (this.floating.mask) {
        this.drawMaskSelection(
          ctx,
          originX,
          originY,
          this.floating.mask,
          this.floating.w,
          this.floating.h,
          this.floating.x,
          this.floating.y,
          { x: 0, y: 0, w: this.floating.w, h: this.floating.h }
        );
      } else {
        this.drawRectSelection(ctx, originX, originY, {
          x: this.floating.x,
          y: this.floating.y,
          w: this.floating.w,
          h: this.floating.h
        });
      }
      return;
    }
    if (this.selection) {
      this.drawSelectionState(ctx, originX, originY, this.selection);
    }
  }

  private drawSelectionState(
    ctx: CanvasRenderingContext2D,
    originX: number,
    originY: number,
    selection: SelectionState
  ): void {
    if (selection.kind === 'rect' || !selection.mask) {
      this.drawRectSelection(ctx, originX, originY, selection.bounds);
      return;
    }
    this.drawMaskSelection(
      ctx,
      originX,
      originY,
      selection.mask,
      this.width,
      this.height,
      0,
      0,
      selection.bounds
    );
  }

  private drawEllipsePreview(
    ctx: CanvasRenderingContext2D,
    originX: number,
    originY: number,
    rect: Rect
  ): void {
    const cx = originX + (rect.x + (rect.w - 1) / 2) * this.zoom;
    const cy = originY + (rect.y + (rect.h - 1) / 2) * this.zoom;
    const rx = Math.max(0.5, (rect.w / 2) * this.zoom);
    const ry = Math.max(0.5, (rect.h / 2) * this.zoom);
    const offset = (Date.now() / 70) % 8;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -offset;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.stroke();
    ctx.lineDashOffset = -offset + 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.stroke();
    ctx.restore();
  }

  private drawRectSelection(
    ctx: CanvasRenderingContext2D,
    originX: number,
    originY: number,
    rect: Rect
  ): void {
    const x = originX + rect.x * this.zoom;
    const y = originY + rect.y * this.zoom;
    const width = rect.w * this.zoom;
    const height = rect.h * this.zoom;
    const offset = (Date.now() / 70) % 8;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -offset;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, width - 1), Math.max(1, height - 1));
    ctx.lineDashOffset = -offset + 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, width - 1), Math.max(1, height - 1));
    ctx.restore();
  }

  private drawMaskSelection(
    ctx: CanvasRenderingContext2D,
    originX: number,
    originY: number,
    mask: Uint8Array,
    maskWidth: number,
    maskHeight: number,
    offsetX: number,
    offsetY: number,
    loop: Rect
  ): void {
    const zoom = this.zoom;
    const isSelected = (x: number, y: number): boolean => {
      if (x < 0 || y < 0 || x >= maskWidth || y >= maskHeight) {
        return false;
      }
      return mask[y * maskWidth + x] === 1;
    };
    ctx.beginPath();
    for (let y = loop.y; y < loop.y + loop.h; y += 1) {
      for (let x = loop.x; x < loop.x + loop.w; x += 1) {
        if (mask[y * maskWidth + x] !== 1) {
          continue;
        }
        const screenX = Math.round(originX + (offsetX + x) * zoom) + 0.5;
        const screenY = Math.round(originY + (offsetY + y) * zoom) + 0.5;
        if (!isSelected(x, y - 1)) {
          ctx.moveTo(screenX, screenY);
          ctx.lineTo(screenX + zoom, screenY);
        }
        if (!isSelected(x, y + 1)) {
          ctx.moveTo(screenX, screenY + zoom);
          ctx.lineTo(screenX + zoom, screenY + zoom);
        }
        if (!isSelected(x - 1, y)) {
          ctx.moveTo(screenX, screenY);
          ctx.lineTo(screenX, screenY + zoom);
        }
        if (!isSelected(x + 1, y)) {
          ctx.moveTo(screenX + zoom, screenY);
          ctx.lineTo(screenX + zoom, screenY + zoom);
        }
      }
    }
    const offset = (Date.now() / 70) % 8;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -offset;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.stroke();
    ctx.lineDashOffset = -offset + 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.stroke();
    ctx.restore();
  }

  private drawHover(ctx: CanvasRenderingContext2D, originX: number, originY: number): void {
    if (!this.hover || this.dragFloat) {
      return;
    }
    if (!PAINT_TOOLS.includes(this.prefs.tool as PaintTool)) {
      return;
    }
    const size = this.prefs.brushSize;
    const start = -Math.floor(size / 2);
    const x = originX + (this.hover.x + start) * this.zoom;
    const y = originY + (this.hover.y + start) * this.zoom;
    const width = size * this.zoom;
    const height = size * this.zoom;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.strokeRect(x - 0.5, y - 0.5, width + 1, height + 1);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, width - 1), Math.max(1, height - 1));
    ctx.restore();
  }

  private drawBorder(
    ctx: CanvasRenderingContext2D,
    originX: number,
    originY: number,
    imageW: number,
    imageH: number
  ): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(originX + 0.5, originY + 0.5, Math.max(1, imageW - 1), Math.max(1, imageH - 1));
    ctx.restore();
  }
}

const editor = new PixelEditor();

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (isHostMessage(event.data)) {
    editor.handleHostMessage(event.data);
  }
});

window.addEventListener('error', (event) => {
  console.error('Error en el editor de pixel art', event.error ?? event.message);
});
