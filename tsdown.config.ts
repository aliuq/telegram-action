import { defineConfig } from 'tsdown';

export default defineConfig({
  sourcemap: true,
  clean: true,
  outExtensions: () => ({ js: '.js' }),
  deps: {
    onlyBundle: false,
  },
});
