import { build } from 'esbuild'

/** Load production TypeScript logic without constructing Phaser's browser runtime. */
export async function loadTs(entryPoint) {
  globalThis.navigator ??= { maxTouchPoints: 0 }
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    plugins: [{
      name: 'phaser-stub',
      setup(b) {
        b.onResolve({ filter: /^phaser$/ }, () => ({ path: 'phaser', namespace: 'stub' }))
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default {}', loader: 'js' }))
      },
    }],
  })
  const source = Buffer.from(result.outputFiles[0].contents).toString('base64')
  return import(`data:text/javascript;base64,${source}`)
}
