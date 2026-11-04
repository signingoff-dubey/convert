import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Starting exiftool, the text reader or ffmpeg for the first time can take several seconds on a busy or slow PC.
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
