import { describe, expect, it } from 'vitest';
import { sendEmailSchema } from '@/lib/validation/email';
import { buildLeadEmailHtml, buildLeadSubject } from './emailTemplate';

describe('lead email template', () => {
  const lead = sendEmailSchema.parse({
    name: '<script>alert(1)</script>',
    email: 'ion@example.com',
    phone: '+40 712 345 678',
    message: '<img src=x onerror=alert(1)>\n"quoted" & more',
    configurationSummary: {
      dimensions: { length: 12, width: 12, height: 3 },
      foundation: true,
      sandwichPanels: false,
      insulation: 0,
      openings: { windows: 1, doors: 0, garageDoors: 0 },
      estimatedPrice: 24000,
    },
  });

  it('renders user input escaped (fuzz: <script> in the name)', () => {
    const html = buildLeadEmailHtml(lead, null);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;<br/>&quot;quoted&quot; &amp; more');
    expect(html).toContain('€24,000');
  });

  it('includes the server-built link escaped, and omits it when absent', () => {
    const link = 'https://carstar.example/configuration/AbC_123-xyz0';
    expect(buildLeadEmailHtml(lead, link)).toContain(`<a href="${link}">${link}</a>`);
    expect(buildLeadEmailHtml(lead, null)).not.toContain('Link configurare');
  });

  it('builds a single-line subject', () => {
    const subject = buildLeadSubject({ ...lead, name: 'Ion\r\nBcc: victim@example.com' });
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject).toBe('Cerere Nouă - Ion Bcc: victim@example.com | 12×12×3m');
  });
});
