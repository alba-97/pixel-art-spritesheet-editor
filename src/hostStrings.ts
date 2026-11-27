import * as vscode from 'vscode';
import type { UILanguage } from './protocol';

export interface HostStrings {
  newSpriteTitle: string;
  widthPrompt: string;
  heightPrompt: string;
  invalidDimension: string;
  saveTitle: string;
  openImageTitle: string;
  pngFilter: string;
  saveFailed: string;
  editorTimeout: string;
  editorClosedBeforeSave: string;
  documentClosed: string;
  invalidImage: string;
  emptyImage: string;
  backupReadFailed: string;
  backupCreateFailed: string;
  backupDeleteFailed: string;
  languageUpdateFailed: string;
}

const en: HostStrings = {
  newSpriteTitle: 'New sprite',
  widthPrompt: 'Width in pixels',
  heightPrompt: 'Height in pixels',
  invalidDimension: 'Enter an integer between 1 and 4096.',
  saveTitle: 'Save new sprite',
  openImageTitle: 'Open image',
  pngFilter: 'PNG image',
  saveFailed: 'Could not save the image',
  editorTimeout: 'The editor did not respond in time while saving.',
  editorClosedBeforeSave: 'The editor closed before saving finished.',
  documentClosed: 'The document was closed.',
  invalidImage: 'The editor returned an image in an invalid format.',
  emptyImage: 'The editor returned an empty image.',
  backupReadFailed: 'Could not read the editor backup, opening the original file.',
  backupCreateFailed: 'Could not create the editor backup.',
  backupDeleteFailed: 'Could not delete the backup.',
  languageUpdateFailed: 'Could not change the editor language.'
};

const es: HostStrings = {
  newSpriteTitle: 'Nuevo sprite',
  widthPrompt: 'Ancho en píxeles',
  heightPrompt: 'Alto en píxeles',
  invalidDimension: 'Introduce un número entero entre 1 y 4096.',
  saveTitle: 'Guardar nuevo sprite',
  openImageTitle: 'Abrir imagen',
  pngFilter: 'Imagen PNG',
  saveFailed: 'No se pudo guardar la imagen',
  editorTimeout: 'El editor no respondió a tiempo al guardar.',
  editorClosedBeforeSave: 'El editor se cerró antes de terminar de guardar.',
  documentClosed: 'El documento se cerró.',
  invalidImage: 'El editor devolvió una imagen con un formato no válido.',
  emptyImage: 'El editor devolvió una imagen vacía.',
  backupReadFailed: 'No se pudo leer la copia de seguridad del editor, se abre el archivo original.',
  backupCreateFailed: 'No se pudo crear la copia de seguridad del editor.',
  backupDeleteFailed: 'No se pudo eliminar la copia de seguridad.',
  languageUpdateFailed: 'No se pudo cambiar el idioma del editor.'
};

export function hostLanguage(): UILanguage {
  const raw = vscode.workspace.getConfiguration('pixelArt').get<string>('language', 'auto');
  if (raw === 'en' || raw === 'es') {
    return raw;
  }
  return vscode.env.language.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function hostStrings(): HostStrings {
  return hostLanguage() === 'es' ? es : en;
}
