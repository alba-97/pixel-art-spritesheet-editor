export type ImageFormat = 'png';

export type UILanguage = 'en' | 'es';
export type LanguagePreference = 'auto' | UILanguage;

export interface LanguageInfo {
  language: UILanguage;
  preference: LanguagePreference;
  systemLanguage: UILanguage;
}

export interface InitMessage extends LanguageInfo {
  type: 'init';
  dataUrl: string;
  fileName: string;
  format: ImageFormat;
}

export interface LoadMessage extends LanguageInfo {
  type: 'load';
  dataUrl: string;
  fileName: string;
  format: ImageFormat;
}

export interface LanguageMessage extends LanguageInfo {
  type: 'language';
}

export interface SerializeRequest {
  type: 'serialize';
  id: number;
  format: ImageFormat;
}

export interface SavedMessage {
  type: 'saved';
  historyIndex: number;
}

export interface SaveErrorMessage {
  type: 'saveError';
  message: string;
}

export type EditorAction = 'undo' | 'redo';

export interface ActionMessage {
  type: 'action';
  action: EditorAction;
}

export type HostMessage =
  | InitMessage
  | LoadMessage
  | LanguageMessage
  | SerializeRequest
  | SavedMessage
  | SaveErrorMessage
  | ActionMessage;

export interface ReadyMessage {
  type: 'ready';
}

export interface DirtyMessage {
  type: 'dirty';
  dirty: boolean;
}

export interface SerializedMessage {
  type: 'serialized';
  id: number;
  dataUrl: string;
  historyIndex: number;
}

export interface SaveRequestMessage {
  type: 'save';
}

export interface SetLanguageMessage {
  type: 'setLanguage';
  preference: LanguagePreference;
}

export type WebviewMessage =
  | ReadyMessage
  | DirtyMessage
  | SerializedMessage
  | SaveRequestMessage
  | SetLanguageMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isUILanguage(value: unknown): value is UILanguage {
  return value === 'en' || value === 'es';
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'auto' || value === 'en' || value === 'es';
}

export function parseWebviewMessage(value: unknown): WebviewMessage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  switch (value.type) {
    case 'ready':
      return { type: 'ready' };
    case 'save':
      return { type: 'save' };
    case 'dirty':
      return typeof value.dirty === 'boolean'
        ? { type: 'dirty', dirty: value.dirty }
        : undefined;
    case 'serialized':
      return typeof value.id === 'number' &&
        typeof value.dataUrl === 'string' &&
        typeof value.historyIndex === 'number'
        ? { type: 'serialized', id: value.id, dataUrl: value.dataUrl, historyIndex: value.historyIndex }
        : undefined;
    case 'setLanguage':
      return isLanguagePreference(value.preference)
        ? { type: 'setLanguage', preference: value.preference }
        : undefined;
    default:
      return undefined;
  }
}

function hasLanguageInfo(value: Record<string, unknown>): boolean {
  return (
    isUILanguage(value.language) &&
    isLanguagePreference(value.preference) &&
    isUILanguage(value.systemLanguage)
  );
}

export function isHostMessage(value: unknown): value is HostMessage {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.type) {
    case 'init':
    case 'load':
      return (
        typeof value.dataUrl === 'string' &&
        typeof value.fileName === 'string' &&
        value.format === 'png' &&
        hasLanguageInfo(value)
      );
    case 'language':
      return hasLanguageInfo(value);
    case 'serialize':
      return typeof value.id === 'number' && value.format === 'png';
    case 'saved':
      return typeof value.historyIndex === 'number';
    case 'saveError':
      return typeof value.message === 'string';
    case 'action':
      return value.action === 'undo' || value.action === 'redo';
    default:
      return false;
  }
}
