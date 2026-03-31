import { defineConfig } from 'tsdown';

export default defineConfig({
  clean: true,
  outExtensions: () => ({ js: '.js' }),
  deps: {
    onlyBundle: false,
  },
});
