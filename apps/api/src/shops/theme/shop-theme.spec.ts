import { BadRequestException } from '@nestjs/common';
import { normalizeLogoUrl, normalizeThemeConfig } from './shop-theme';

const valid = {
  preset: 'MODERN',
  primaryColor: '#4F46E5',
  secondaryColor: '#0891b2',
  accentColor: '#f59e0b',
  mode: 'system',
  sidebarStyle: 'dark',
  headerStyle: 'light',
  radius: 'rounded',
  font: 'inter',
};

describe('normalizeThemeConfig', () => {
  it('keeps a valid logo size and defaults a missing one', () => {
    const out = normalizeThemeConfig({ ...valid, logoHeight: 32 });
    expect(out.logoHeight).toBe(32);
    expect(out.logoWidth).toBe(200);
  });

  it.each([
    ['logoHeight', 120],
    ['logoHeight', 30.5],
    ['logoWidth', 20],
    ['logoWidth', '150'],
  ])('rejects %s = %p', (field, value) => {
    expect(() => normalizeThemeConfig({ ...valid, [field]: value })).toThrow(
      BadRequestException,
    );
  });

  it('keeps known keys, lowercases colours and stamps the version', () => {
    const out = normalizeThemeConfig({ ...valid, extra: 'dropped' });
    expect(out).toEqual({
      version: 1,
      ...valid,
      primaryColor: '#4f46e5',
      logoHeight: 46,
      logoWidth: 200,
    });
    expect(out).not.toHaveProperty('extra');
  });

  it.each([
    ['preset', 'NEON'],
    ['primaryColor', 'red'],
    ['accentColor', '#fff'],
    ['mode', 'sepia'],
    ['sidebarStyle', 'glass'],
    ['radius', 'huge'],
    ['font', 'comic'],
  ])('rejects an invalid %s', (key, value) => {
    expect(() => normalizeThemeConfig({ ...valid, [key]: value })).toThrow(
      BadRequestException,
    );
  });

  it('rejects non-objects', () => {
    expect(() => normalizeThemeConfig(null)).toThrow(BadRequestException);
    expect(() => normalizeThemeConfig([])).toThrow(BadRequestException);
  });
});

describe('normalizeLogoUrl', () => {
  it('passes through undefined and null, and clears empty strings', () => {
    expect(normalizeLogoUrl(undefined)).toBeUndefined();
    expect(normalizeLogoUrl(null)).toBeNull();
    expect(normalizeLogoUrl('  ')).toBeNull();
  });

  it('accepts https and rejects other schemes', () => {
    expect(normalizeLogoUrl(' https://res.cloudinary.com/x/logo.png ')).toBe(
      'https://res.cloudinary.com/x/logo.png',
    );
    expect(() => normalizeLogoUrl('http://example.com/a.png')).toThrow(
      BadRequestException,
    );
    expect(() => normalizeLogoUrl('javascript:alert(1)')).toThrow(
      BadRequestException,
    );
  });
});
