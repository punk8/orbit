const secretPatterns = [
  /authorization:\s*bearer\s+[a-z0-9._-]+/gi,
  /api[_-]?key\s*[:=]\s*["']?[a-z0-9._-]+["']?/gi,
  /password\s*[:=]\s*["']?[^"'\s]+["']?/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
];

export function redactSecrets(input: string): string {
  return secretPatterns.reduce((text, pattern) => text.replace(pattern, "[REDACTED]"), input);
}
