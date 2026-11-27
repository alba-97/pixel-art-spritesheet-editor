import * as vscode from 'vscode';
import { homedir } from 'node:os';
import { hostStrings } from './hostStrings';
import { PixelEditorProvider, VIEW_TYPE } from './pixelEditorProvider';
import { createBlankPng } from './png';

function validateDimension(value: string): string | undefined {
  const size = Number(value);
  if (!Number.isInteger(size) || size < 1 || size > 4096) {
    return hostStrings().invalidDimension;
  }
  return undefined;
}

async function newSprite(): Promise<void> {
  const strings = hostStrings();
  const widthText = await vscode.window.showInputBox({
    title: strings.newSpriteTitle,
    prompt: strings.widthPrompt,
    value: '32',
    validateInput: validateDimension
  });
  if (widthText === undefined) {
    return;
  }

  const heightText = await vscode.window.showInputBox({
    title: strings.newSpriteTitle,
    prompt: strings.heightPrompt,
    value: widthText,
    validateInput: validateDimension
  });
  if (heightText === undefined) {
    return;
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const defaultUri = vscode.Uri.joinPath(workspaceFolder?.uri ?? vscode.Uri.file(homedir()), 'sprite.png');

  const destination = await vscode.window.showSaveDialog({
    title: strings.saveTitle,
    defaultUri,
    filters: { [strings.pngFilter]: ['png'] }
  });
  if (!destination) {
    return;
  }

  try {
    const width = Number(widthText);
    const height = Number(heightText);
    const bytes = createBlankPng(width, height);
    await vscode.workspace.fs.writeFile(destination, bytes);
    await vscode.commands.executeCommand('vscode.openWith', destination, VIEW_TYPE);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`${strings.saveFailed}: ${message}`);
  }
}

async function openWithPixelEditor(resource?: vscode.Uri): Promise<void> {
  let uri = resource;
  if (!uri || uri.scheme === 'output') {
    const strings = hostStrings();
    const selection = await vscode.window.showOpenDialog({
      title: strings.openImageTitle,
      canSelectMany: false,
      filters: { [strings.pngFilter]: ['png'] }
    });
    uri = selection?.[0];
  }
  if (!uri) {
    return;
  }
  await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE);
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new PixelEditorProvider(context);
  context.subscriptions.push(
    provider.register(),
    provider,
    vscode.commands.registerCommand('pixelArt.undo', () => provider.triggerAction('undo')),
    vscode.commands.registerCommand('pixelArt.redo', () => provider.triggerAction('redo')),
    vscode.commands.registerCommand('pixelArt.copy', () => provider.triggerAction('copy')),
    vscode.commands.registerCommand('pixelArt.cut', () => provider.triggerAction('cut')),
    vscode.commands.registerCommand('pixelArt.paste', () => provider.triggerAction('paste')),
    vscode.commands.registerCommand('pixelArt.selectAll', () => provider.triggerAction('selectAll')),
    vscode.commands.registerCommand('pixelArt.deselect', () => provider.triggerAction('deselect')),
    vscode.commands.registerCommand('pixelArt.newSprite', newSprite),
    vscode.commands.registerCommand('pixelArt.openWith', openWithPixelEditor)
  );
}

export function deactivate(): void {}
