// Load .env.local before anything reads process.env. Existing env vars (e.g. CI secrets) win.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the environment.
}
