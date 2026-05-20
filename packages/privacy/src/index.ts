const secretPatterns = [
  /authorization:\s*bearer\s+[a-z0-9._~+/=-]+/gi,
  /api[_-]?key\s*[:=]\s*["']?[a-z0-9._~+/=-]+["']?/gi,
  /password\s*[:=]\s*["']?[^"'\s]+["']?/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
  /\b(?:\+?\d[\d\s().-]{7,}\d)\b/g,
  /https?:\/\/[^\s"'<>]+/gi,
  /\/Users\/[^\s"'<>]+/g
];

export function redactSecrets(input: string): string {
  return secretPatterns.reduce((text, pattern) => text.replace(pattern, "[REDACTED]"), input);
}
