import {defineConfig} from 'vitest/config';

// Optional editor checkouts have their own browser/native suites. The application
// gate remains deliberately offline and limited to our colocated unit tests.
export default defineConfig({test: {include: ['src/**/*.test.ts', 'src/**/*.test.tsx']}});
