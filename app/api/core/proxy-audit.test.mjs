import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/api/core/[...path]/route.ts', 'utf8');

describe('care proxy audit metadata', () => {
  it('adds IP address and user agent to patient form submissions and consent signatures', () => {
    expect(source).toMatch(/function shouldAttachCareAuditMetadata/);
    expect(source).toContain('^\\/care\\/forms\\/[^/]+\\/submit$');
    expect(source).toContain('^\\/care\\/consents\\/[^/]+\\/sign$');
    expect(source).toMatch(/ipAddress: clientIpAddress\(request\)/);
    expect(source).toMatch(/userAgent: request\.headers\.get\('user-agent'\)/);
    expect(source).toMatch(/x-forwarded-for/);
    expect(source).toMatch(/x-real-ip/);
  });
});
