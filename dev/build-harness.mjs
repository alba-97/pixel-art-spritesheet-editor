import { readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync('media/editor.html', 'utf8');
let html = source
  .replaceAll('__CSP__', "default-src 'self' 'unsafe-inline' data: blob:")
  .replaceAll('__SCRIPT_URI__', '../media/main.js')
  .replaceAll('__STYLE_URI__', '../media/style.css')
  .replaceAll('__LANGUAGE__', 'en')
  .replaceAll('__NONCE__', 'dev');

html = html.replace(
  '<script nonce="dev"',
  '  <script src="harness-stub.js"></script>\n  <script nonce="dev"'
);

writeFileSync('dev/harness.html', html);
console.log('Harness generado en dev/harness.html');
