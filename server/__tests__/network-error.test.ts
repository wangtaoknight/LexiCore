import { describe, expect, it } from 'vitest';
import { describeNetworkError } from '../ai/client';

function networkError(code: string): Error {
  return Object.assign(new TypeError('fetch failed'), { cause: { code } });
}

describe('describeNetworkError', () => {
  it('连接超时给出代理提示', () => {
    expect(describeNetworkError(networkError('UND_ERR_CONNECT_TIMEOUT'))).toContain('代理');
    expect(describeNetworkError(networkError('ETIMEDOUT'))).toContain('连接超时');
  });

  it('DNS 失败给出 DNS 提示', () => {
    expect(describeNetworkError(networkError('ENOTFOUND'))).toContain('DNS');
    expect(describeNetworkError(networkError('EAI_AGAIN'))).toContain('DNS');
  });

  it('连接被拒绝提示代理端口', () => {
    expect(describeNetworkError(networkError('ECONNREFUSED'))).toContain('代理地址与端口');
  });

  it('证书错误提示 HTTPS 拦截', () => {
    expect(describeNetworkError(networkError('SELF_SIGNED_CERT_IN_CHAIN'))).toContain('证书');
  });

  it('未知错误保留原始信息', () => {
    expect(describeNetworkError(new Error('boom'))).toContain('boom');
  });
});
