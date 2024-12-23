import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: ["./src/index"],
  // sourcemap: true,
  rollup: {
    emitCJS: true,
    esbuild: {
      minify: true,
    },
    output: {
      entryFileNames: '[name].js',
      chunkFileNames: 'libs/[name].js',
      manualChunks(id: string, _meta: any) {
        if (id.includes('node_modules')) {
          const pkgName = extractPackageName(id);
          if (pkgName) {
            // Fix for undici and @actions error on act
            if (pkgName.includes('@actions') || pkgName.includes('undici')) {
              return "@actions_undici";
            }
            return `${pkgName}`;
          }
        }
      },
    }
  },
  failOnWarn: false,
  hooks: {
    'rollup:options': (_ctx, options) => {
      // @ts-expect-error - types is Array<OutputOptions>
      options.output = options.output.filter((o: any) => o.format === 'cjs')
    },
  },
})

/**
 * 从模块路径中提取 package 名称和版本号，格式化为 chunk 名称
 * 
 * @param modulePath 模块路径
 * @returns 提取的 chunk 名称
 * 
 * 用例:
 * 1. node_modules/.pnpm/@actions+io@1.1.3/node_modules/@actions/io/lib/io.js?commonjs-exports
 * 2. node_modules/.pnpm/undici@5.28.4/node_modules/undici/lib/api/api-request.js
 */
function extractPackageName(input: string): string {
  // Regular expression to match package name and version
  const regex = /node_modules\/\.pnpm\/(.*?)\//;
  const match = input.match(regex);

  if (match) {
    return match[1].replace('/', '_')
  } else {
    return ""; // Return empty string if no match is found
  }
}