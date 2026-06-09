import { describe, expect, it, vi } from 'vitest';
import { evaluateLicenseRows, parseLicenseCsv, parseRemoteLicenseStatus, resolveRemoteLicense, serializeRemoteLicenseStatus } from './remoteLicense';

const csv = `appId,active,blocked,minVersion,maxVersion,blockedVersions,allowedModels,blockedModels,message,notification,updatedAt
aulapay,true,false,1.8.0,,,,,Aplicativo liberado,Mensagem geral,2026-06-09`;

describe('remote license control', () => {
  it('parses the published sheet CSV format', () => {
    expect(parseLicenseCsv(csv)).toEqual([
      expect.objectContaining({ appId: 'aulapay', active: 'true', blocked: 'false', minVersion: '1.8.0', message: 'Aplicativo liberado', notification: 'Mensagem geral' }),
    ]);
  });

  it('allows active rows that are not blocked', () => {
    expect(evaluateLicenseRows(parseLicenseCsv(csv), 'aulapay', '1.8.0')).toEqual({
      allowed: true,
      message: 'Aplicativo liberado',
      notification: 'Mensagem geral',
    });
  });

  it('blocks inactive and explicitly blocked rows', () => {
    expect(evaluateLicenseRows(parseLicenseCsv('appId,active,blocked,message\naulapay,false,false,Manutencao'), 'aulapay', '1.8.0')).toEqual({
      allowed: false,
      message: 'Manutencao',
      notification: '',
    });
    expect(evaluateLicenseRows(parseLicenseCsv('appId,active,blocked,message\naulapay,true,true,Bloqueado'), 'aulapay', '1.8.0')).toEqual({
      allowed: false,
      message: 'Bloqueado',
      notification: '',
    });
  });

  it('blocks versions outside the allowed range', () => {
    expect(evaluateLicenseRows(parseLicenseCsv('appId,active,blocked,minVersion,message\naulapay,true,false,1.9.0,Atualize'), 'aulapay', '1.8.0')).toEqual({
      allowed: false,
      message: 'Atualize',
      notification: '',
    });
    expect(evaluateLicenseRows(parseLicenseCsv('appId,active,blocked,maxVersion,message\naulapay,true,false,1.7.9,Versao invalida'), 'aulapay', '1.8.0')).toEqual({
      allowed: false,
      message: 'Versao invalida',
      notification: '',
    });
  });

  it('blocks specific app versions', () => {
    expect(evaluateLicenseRows(parseLicenseCsv('appId,active,blocked,blockedVersions,message\naulapay,true,false,"1.7.0,1.8.0",Versao bloqueada'), 'aulapay', '1.8.0')).toEqual({
      allowed: false,
      message: 'Versao bloqueada',
      notification: '',
    });
  });

  it('allows and blocks by configured device models', () => {
    const deviceInfo = { labels: ['Samsung Galaxy A13', 'Samsung SM-A135M'] };
    expect(evaluateLicenseRows(parseLicenseCsv('appId,active,blocked,allowedModels,message\naulapay,true,false,Galaxy A13,Bloqueado'), 'aulapay', '1.8.0', deviceInfo)).toMatchObject({
      allowed: true,
    });
    expect(evaluateLicenseRows(parseLicenseCsv('appId,active,blocked,blockedModels,message\naulapay,true,false,Samsung Galaxy A13,Bloqueado'), 'aulapay', '1.8.0', deviceInfo)).toEqual({
      allowed: false,
      message: 'Bloqueado',
      notification: '',
    });
    expect(evaluateLicenseRows(parseLicenseCsv('appId,active,blocked,allowedModels,message\naulapay,true,false,Motorola Moto G,Bloqueado'), 'aulapay', '1.8.0', deviceInfo)).toEqual({
      allowed: false,
      message: 'Bloqueado',
      notification: '',
    });
  });

  it('uses cache and fallback when remote fetch fails', async () => {
    const cached = { allowed: false, message: 'Bloqueado antes', notification: '', checkedAt: '2026-06-09T10:00:00.000Z', source: 'remote' as const };
    const fetcher = vi.fn(() => Promise.resolve(new Response('', { status: 500 })));
    await expect(resolveRemoteLicense({
      appId: 'aulapay',
      appVersion: '1.8.0',
      csvUrl: 'https://example.test/license.csv',
      cached,
      now: new Date('2026-06-09T11:00:00.000Z'),
      force: true,
      fetcher: fetcher as typeof fetch,
    })).resolves.toMatchObject({ allowed: false, message: 'Bloqueado antes', source: 'cache' });

    await expect(resolveRemoteLicense({
      appId: 'aulapay',
      appVersion: '1.8.0',
      csvUrl: 'https://example.test/license.csv',
      cached: null,
      now: new Date('2026-06-09T11:00:00.000Z'),
      force: true,
      fetcher: fetcher as typeof fetch,
    })).resolves.toMatchObject({ allowed: true, source: 'fallback' });
  });

  it('round-trips cached status safely', () => {
    const status = { allowed: true, message: 'Ok', notification: 'Aviso', checkedAt: '2026-06-09T10:00:00.000Z', source: 'remote' as const };
    expect(parseRemoteLicenseStatus(serializeRemoteLicenseStatus(status))).toEqual(status);
    expect(parseRemoteLicenseStatus('not-json')).toBeNull();
  });
});
