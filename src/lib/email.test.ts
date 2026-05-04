import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockResendConstructor, mockSend } = vi.hoisted(() => {
  const mockSend = vi.fn();
  const mockResendConstructor = vi.fn(() => ({
    emails: {
      send: mockSend,
    },
  }));
  return { mockResendConstructor, mockSend };
});

vi.mock('resend', () => ({
  Resend: mockResendConstructor,
}));

import { sendWelcomeEmail } from './email';

const originalResendApiKey = process.env.RESEND_API_KEY;

afterEach(() => {
  process.env.RESEND_API_KEY = originalResendApiKey;
  mockSend.mockReset();
  mockResendConstructor.mockClear();
});

describe('sendWelcomeEmail', () => {
  it('throws when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY;

    await expect(sendWelcomeEmail('test@example.com', 'Alice')).rejects.toThrow('RESEND_API_KEY is missing');
    expect(mockResendConstructor).not.toHaveBeenCalled();
  });

  it('sends email via Resend and returns data on success', async () => {
    process.env.RESEND_API_KEY = 'test-api-key';
    mockSend.mockResolvedValueOnce({ data: { id: 'email_1' }, error: null });

    const result = await sendWelcomeEmail('test@example.com', 'Alice');

    expect(result).toEqual({ id: 'email_1' });
    expect(mockResendConstructor).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledTimes(1);

    const payload = mockSend.mock.calls[0]?.[0] as any;
    expect(payload.to).toBe('test@example.com');
    expect(payload.subject).toBe('你的虚拟试衣网站');
    expect(payload.from).toBe('虚拟换衣 <onboarding@resend.dev>');
    expect(String(payload.html)).toContain('Alice');
  });

  it('throws when Resend responds with error', async () => {
    process.env.RESEND_API_KEY = 'test-api-key';
    mockSend.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });

    await expect(sendWelcomeEmail('test@example.com', 'Alice')).rejects.toThrow('boom');
  });
});
