import { describe, expect, it } from 'vitest';
import {
  configurationDataSchema,
  createConfigurationSchema,
  escapeHtml,
  loginSchema,
  MAX_OPENINGS,
  normalizeOrigin,
  parseConfigurationLink,
  pricesSchema,
  sendEmailSchema,
  toHeaderSafe,
} from '@/lib/validation';
import { DEFAULT_PRICES } from '@/lib/pricing';

const opening = {
  id: 'V1StGXR8_Z5jdHi6B-myT',
  type: 'window',
  wallId: 'PereteFata',
  offsetX: 2.5,
  sill: 1,
  width: 1.2,
  height: 1,
};

const legacyOpening = {
  id: 'opening-1',
  type: 'door',
  wallId: 'PereteSTG',
  posX: 0.5,
  posY: 0.4,
  width: 1,
  height: 2.1,
};

const validData = {
  dimensions: { length: 12, width: 12, height: 3 },
  floorArea: 144,
  numberOfBays: 2,
  foundation: true,
  sandwichPanels: false,
  insulation: 0,
  openings: { windows: 1, doors: 0, garageDoors: 0 },
  estimatedPrice: 24000,
  openingsList: [opening],
};

describe('configurationDataSchema', () => {
  it('accepts the payload produced by the configurator', () => {
    expect(configurationDataSchema.safeParse(validData).success).toBe(true);
  });

  it('strips unknown keys', () => {
    const r = configurationDataSchema.parse({ ...validData, evil: '<script>' });
    expect(r).not.toHaveProperty('evil');
  });

  it.each([
    ['length too small', { dimensions: { length: 6, width: 12, height: 3 } }],
    ['width too large', { dimensions: { length: 12, width: 21, height: 3 } }],
    ['height not a number', { dimensions: { length: 12, width: 12, height: '3' } }],
    ['infinite length', { dimensions: { length: Infinity, width: 12, height: 3 } }],
    ['foundation not boolean', { foundation: 'yes' }],
    ['insulation out of range', { insulation: 10 }],
    ['negative price', { estimatedPrice: -1 }],
  ])('rejects %s', (_label, patch) => {
    expect(configurationDataSchema.safeParse({ ...validData, ...patch }).success).toBe(false);
  });

  it('accepts insulation 0 and 30..250', () => {
    for (const insulation of [0, 30, 120, 250]) {
      expect(configurationDataSchema.safeParse({ ...validData, insulation }).success).toBe(true);
    }
  });

  it(`caps openingsList at ${MAX_OPENINGS}`, () => {
    const many = Array.from({ length: MAX_OPENINGS + 1 }, (_, i) => ({ ...opening, id: `o${i}` }));
    expect(configurationDataSchema.safeParse({ ...validData, openingsList: many }).success).toBe(false);
  });

  it('accepts metric (v1) and legacy (v0) openings', () => {
    const r = configurationDataSchema.parse({ ...validData, openingsList: [opening, legacyOpening] });
    expect(r.openingsList).toEqual([opening, legacyOpening]);
  });

  it('rejects malformed openings', () => {
    const { offsetX: _o, ...noOffset } = opening;
    void _o;
    for (const bad of [
      { ...opening, type: 'skylight' },
      { ...opening, wallId: 'Roof' },
      { ...opening, offsetX: -1 },
      { ...opening, offsetX: 500 },
      { ...opening, sill: Infinity },
      { ...opening, width: 0 },
      { ...opening, id: '' },
      noOffset,
      { ...legacyOpening, posX: 1.5 },
    ]) {
      expect(configurationDataSchema.safeParse({ ...validData, openingsList: [bad] }).success).toBe(false);
    }
  });
});

describe('createConfigurationSchema', () => {
  it('turns empty contact fields into null', () => {
    const r = createConfigurationSchema.parse({ data: validData, userName: '', userEmail: '', userPhone: '' });
    expect(r).toMatchObject({ userName: null, userEmail: null, userPhone: null });
  });

  it('rejects an invalid email and phone', () => {
    expect(createConfigurationSchema.safeParse({ data: validData, userEmail: 'nope' }).success).toBe(false);
    expect(createConfigurationSchema.safeParse({ data: validData, userPhone: '<b>' }).success).toBe(false);
  });

  it('requires data', () => {
    expect(createConfigurationSchema.safeParse({}).success).toBe(false);
  });
});

describe('pricesSchema', () => {
  it('accepts the defaults', () => {
    expect(pricesSchema.parse(DEFAULT_PRICES)).toEqual(DEFAULT_PRICES);
  });

  it.each([
    ['negative', -1],
    ['string', '45'],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['too large', 1e7],
  ])('rejects a %s value', (_label, value) => {
    expect(pricesSchema.safeParse({ ...DEFAULT_PRICES, structurePerM3: value }).success).toBe(false);
  });

  it('rejects missing and extra fields', () => {
    const { doorPerUnit: _omit, ...missing } = DEFAULT_PRICES;
    void _omit;
    expect(pricesSchema.safeParse(missing).success).toBe(false);
    expect(pricesSchema.safeParse({ ...DEFAULT_PRICES, id: 'x' }).success).toBe(false);
  });
});

describe('sendEmailSchema', () => {
  const base = { name: 'Ion', email: 'ion@example.com', phone: '+40 712 345 678', message: 'Salut' };

  it('accepts a normal lead', () => {
    expect(sendEmailSchema.safeParse({ ...base, configurationSummary: validData }).success).toBe(true);
  });

  it('requires a valid email and caps lengths', () => {
    expect(sendEmailSchema.safeParse({ ...base, email: 'x' }).success).toBe(false);
    expect(sendEmailSchema.safeParse({ ...base, name: 'a'.repeat(101) }).success).toBe(false);
    expect(sendEmailSchema.safeParse({ ...base, message: 'a'.repeat(2001) }).success).toBe(false);
  });

  it('rejects CR/LF injection in the email address', () => {
    expect(sendEmailSchema.safeParse({ ...base, email: 'a@b.com\r\nBcc: x@y.com' }).success).toBe(false);
  });
});

describe('configuration link allow-list', () => {
  const origin = 'https://carstar.example';

  it('accepts our own configuration link', () => {
    expect(parseConfigurationLink(`${origin}/configuration/AbC_123-xyz0`, origin)).toBe('AbC_123-xyz0');
  });

  it.each([
    'https://evil.example/configuration/AbC_123-xyz0',
    'http://carstar.example/configuration/AbC_123-xyz0',
    'https://carstar.example.evil.example/configuration/AbC_123-xyz0',
    'https://user@carstar.example/configuration/AbC_123-xyz0',
    `${origin}/configuration/AbC_123-xyz0?x=1`,
    `${origin}/configuration/AbC_123-xyz0#frag`,
    `${origin}/configuration/short`,
    `${origin}/admin`,
    'javascript:alert(1)',
    'not a url',
  ])('rejects %s', (link) => {
    expect(parseConfigurationLink(link, origin)).toBeNull();
  });

  it('normalises origins', () => {
    expect(normalizeOrigin('https://carstar.example/')).toBe(origin);
    expect(normalizeOrigin('ftp://x')).toBeNull();
    expect(normalizeOrigin(undefined)).toBeNull();
  });
});

describe('escapeHtml / toHeaderSafe', () => {
  it('escapes HTML metacharacters', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(escapeHtml(`'&\``)).toBe('&#39;&amp;&#96;');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });

  it('strips CR/LF from headers', () => {
    expect(toHeaderSafe('Hi\r\nBcc: x@y.com')).toBe('Hi Bcc: x@y.com');
    expect(toHeaderSafe('a'.repeat(300), 10)).toHaveLength(10);
  });
});

describe('loginSchema', () => {
  it('requires both fields and rejects extras', () => {
    expect(loginSchema.safeParse({ username: 'a', password: 'b' }).success).toBe(true);
    expect(loginSchema.safeParse({ username: 'a' }).success).toBe(false);
    expect(loginSchema.safeParse({ username: 'a', password: 'b', admin: true }).success).toBe(false);
  });
});
