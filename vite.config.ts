import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, proxy: { '/api': 'http://localhost:3002' } },
  test: { environment: 'node', include: ['tests/**/*.test.{ts,tsx}'] },
});
