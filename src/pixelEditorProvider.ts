import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { hostStrings } from './hostStrings';
import type { EditorAction, HostMessage, ImageFormat, LanguageInfo, UILanguage } from './protocol';
import { isLanguagePreference, parseWebviewMessage } from './protocol';

export const VIEW_TYPE = 'pixelArt.editor';

const MIME_BY_FORMAT: Record<ImageFormat, string> = {
  png: 'image/png'
};

function formatForUri(uri: vscode.Uri): ImageFormat {
  const extension = uri.path.toLowerCase().split('.').pop();
  if (extension === 'png') {
    return 'png';
  }
  return 'png';
}

function bytesToDataUrl(bytes: Uint8Array, format: ImageFormat): string {
  return `data:${MIME_BY_FORMAT[format]};base64,${Buffer.from(bytes).toString('base64')}`;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const marker = ';base64,';
  const index = dataUrl.indexOf(marker);
  if (index < 0 || !dataUrl.startsWith('data:image/png')) {
    throw new Error(hostStrings().invalidImage);
  }
  const buffer = Buffer.from(dataUrl.slice(index + marker.length), 'base64');
  if (buffer.length === 0) {
    throw new Error(hostStrings().emptyImage);
  }
  return new Uint8Array(buffer);
}

function fileNameFor(uri: vscode.Uri): string {
  const segments = uri.path.split('/');
  return segments[segments.length - 1] ?? uri.path;
}

interface SerializeResponse {
  dataUrl: string;
  historyIndex: number;
}

interface SerializedImage {
  bytes: Uint8Array;
  historyIndex: number;
}

interface PendingSerialize {
  resolve: (response: SerializeResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class PixelDocument implements vscode.CustomDocument {
  private bytes: Uint8Array;
  private panel: vscode.WebviewPanel | undefined;
  private pending = new Map<number, PendingSerialize>();
  private nextSerializeId = 1;

  constructor(
    readonly uri: vscode.Uri,
    bytes: Uint8Array
  ) {
    this.bytes = bytes;
  }

  get content(): Uint8Array {
    return this.bytes;
  }

  attach(panel: vscode.WebviewPanel): void {
    this.panel = panel;
  }

  detach(panel: vscode.WebviewPanel): void {
    if (this.panel === panel) {
      this.panel = undefined;
    }
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(hostStrings().editorClosedBeforeSave));
      this.pending.delete(id);
    }
  }

  post(message: HostMessage): void {
    void this.panel?.webview.postMessage(message);
  }

  sendInit(info: LanguageInfo): void {
    this.post({
      type: 'init',
      dataUrl: bytesToDataUrl(this.bytes, formatForUri(this.uri)),
      fileName: fileNameFor(this.uri),
      format: formatForUri(this.uri),
      ...info
    });
  }

  sendReload(info: LanguageInfo): void {
    this.post({
      type: 'load',
      dataUrl: bytesToDataUrl(this.bytes, formatForUri(this.uri)),
      fileName: fileNameFor(this.uri),
      format: formatForUri(this.uri),
      ...info
    });
  }

  setBytes(bytes: Uint8Array): void {
    this.bytes = bytes;
  }

  async serialize(): Promise<SerializedImage> {
    if (!this.panel) {
      return { bytes: this.bytes, historyIndex: -1 };
    }
    const id = this.nextSerializeId;
    this.nextSerializeId += 1;
    const format = formatForUri(this.uri);
    const response = await new Promise<SerializeResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(hostStrings().editorTimeout));
      }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      void this.panel?.webview.postMessage({ type: 'serialize', id, format } satisfies HostMessage);
    });
    const bytes = dataUrlToBytes(response.dataUrl);
    this.bytes = bytes;
    return { bytes, historyIndex: response.historyIndex };
  }

  resolveSerialize(id: number, dataUrl: string, historyIndex: number): void {
    const pending = this.pending.get(id);
    if (!pending) {
      return;
    }
    this.pending.delete(id);
    clearTimeout(pending.timer);
    pending.resolve({ dataUrl, historyIndex });
  }

  dispose(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(hostStrings().documentClosed));
    }
    this.pending.clear();
    this.panel = undefined;
  }
}

export class PixelEditorProvider implements vscode.CustomEditorProvider<PixelDocument> {
  private readonly changeEmitter = new vscode.EventEmitter<
    vscode.CustomDocumentContentChangeEvent<PixelDocument> | vscode.CustomDocumentEditEvent<PixelDocument>
  >();

  readonly onDidChangeCustomDocument = this.changeEmitter.event;

  private template: string | undefined;
  private activePanel: vscode.WebviewPanel | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  register(): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(VIEW_TYPE, this, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false
    });
  }

  triggerAction(action: EditorAction): void {
    void this.activePanel?.webview.postMessage({ type: 'action', action } satisfies HostMessage);
  }

  private getLanguageInfo(): LanguageInfo {
    const raw = vscode.workspace.getConfiguration('pixelArt').get<string>('language', 'auto');
    const preference = isLanguagePreference(raw) ? raw : 'auto';
    const systemLanguage: UILanguage = vscode.env.language.toLowerCase().startsWith('es') ? 'es' : 'en';
    return {
      language: preference === 'auto' ? systemLanguage : preference,
      preference,
      systemLanguage
    };
  }

  async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext
  ): Promise<PixelDocument> {
    let bytes: Uint8Array;
    if (openContext.backupId) {
      try {
        bytes = await vscode.workspace.fs.readFile(vscode.Uri.parse(openContext.backupId));
      } catch (error) {
        console.warn(hostStrings().backupReadFailed, error);
        bytes = await vscode.workspace.fs.readFile(uri);
      }
    } else {
      bytes = await vscode.workspace.fs.readFile(uri);
    }
    return new PixelDocument(uri, bytes);
  }

  async resolveCustomEditor(
    document: PixelDocument,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
    };

    const subscription = panel.webview.onDidReceiveMessage(async (raw: unknown) => {
      const message = parseWebviewMessage(raw);
      if (!message) {
        return;
      }
      switch (message.type) {
        case 'ready':
          document.sendInit(this.getLanguageInfo());
          break;
        case 'dirty':
          if (message.dirty) {
            this.changeEmitter.fire({ document });
          }
          break;
        case 'serialized':
          document.resolveSerialize(message.id, message.dataUrl, message.historyIndex);
          break;
        case 'setLanguage':
          try {
            await vscode.workspace
              .getConfiguration('pixelArt')
              .update('language', message.preference, vscode.ConfigurationTarget.Global);
          } catch (error) {
            console.warn(hostStrings().languageUpdateFailed, error);
            void vscode.window.showWarningMessage(hostStrings().languageUpdateFailed);
          }
          break;
        case 'focusState':
          await vscode.commands.executeCommand('setContext', 'pixelArt.focused', message.focused);
          await vscode.commands.executeCommand('setContext', 'pixelArt.editingText', message.editing);
          break;
        case 'save':
          await vscode.commands.executeCommand('workbench.action.files.save');
          break;
      }
    });

    const languageSubscription = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('pixelArt.language')) {
        document.post({ type: 'language', ...this.getLanguageInfo() });
      }
    });

    document.attach(panel);
    this.activePanel = panel;
    panel.onDidChangeViewState((event) => {
      if (event.webviewPanel.active) {
        this.activePanel = panel;
      }
    });
    panel.webview.html = await this.buildHtml(panel.webview);

    panel.onDidDispose(() => {
      subscription.dispose();
      languageSubscription.dispose();
      document.detach(panel);
      if (this.activePanel === panel) {
        this.activePanel = undefined;
      }
    });
  }

  async saveCustomDocument(document: PixelDocument): Promise<void> {
    await this.write(document, document.uri);
  }

  async saveCustomDocumentAs(document: PixelDocument, destination: vscode.Uri): Promise<void> {
    await this.write(document, destination);
  }

  private async write(document: PixelDocument, destination: vscode.Uri): Promise<void> {
    try {
      const result = await document.serialize();
      await vscode.workspace.fs.writeFile(destination, result.bytes);
      document.setBytes(result.bytes);
      document.post({ type: 'saved', historyIndex: result.historyIndex });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      document.post({ type: 'saveError', message });
      void vscode.window.showErrorMessage(`${hostStrings().saveFailed}: ${message}`);
      throw error;
    }
  }

  async revertCustomDocument(document: PixelDocument): Promise<void> {
    const bytes = await vscode.workspace.fs.readFile(document.uri);
    document.setBytes(bytes);
    document.sendReload(this.getLanguageInfo());
  }

  async backupCustomDocument(
    document: PixelDocument,
    context: vscode.CustomDocumentBackupContext
  ): Promise<vscode.CustomDocumentBackup> {
    const destination = context.destination;
    try {
      const result = await document.serialize();
      await vscode.workspace.fs.writeFile(destination, result.bytes);
      document.setBytes(result.bytes);
    } catch (error) {
      console.warn(hostStrings().backupCreateFailed, error);
    }
    return {
      id: destination.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(destination, { useTrash: false });
        } catch (error) {
          console.warn(hostStrings().backupDeleteFailed, error);
        }
      }
    };
  }

  private async buildHtml(webview: vscode.Webview): Promise<string> {
    if (this.template === undefined) {
      const templateUri = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.html');
      this.template = Buffer.from(await vscode.workspace.fs.readFile(templateUri)).toString('utf8');
    }

    const nonce = randomBytes(16).toString('base64');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'style.css'));
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data: blob:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`
    ].join('; ');

    return this.template
      .replaceAll('__CSP__', csp)
      .replaceAll('__SCRIPT_URI__', scriptUri.toString())
      .replaceAll('__STYLE_URI__', styleUri.toString())
      .replaceAll('__NONCE__', nonce)
      .replaceAll('__LANGUAGE__', this.getLanguageInfo().language);
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }
}
