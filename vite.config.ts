import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      // One entry per page: the overview, then one page for each audience (paths from the project root).
      input: {
        main: 'index.html',
        students: 'students.html',
        instructors: 'instructors.html',
        guide: 'guide.html',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
