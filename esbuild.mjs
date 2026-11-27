import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const common = {
  bundle: true,
  minify: production,
  sourcemap: production ? false : 'inline',
  logLevel: 'info'
};

const extension = await esbuild.context({
  ...common,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode']
});

const webview = await esbuild.context({
  ...common,
  entryPoints: ['webview/main.ts'],
  outfile: 'media/main.js',
  platform: 'browser',
  format: 'iife',
  target: 'chrome110'
});

if (watch) {
  await extension.watch();
  await webview.watch();
  console.log('Watching extension and webview...');
} else {
  await Promise.all([extension.rebuild(), webview.rebuild()]);
  await Promise.all([extension.dispose(), webview.dispose()]);
}
