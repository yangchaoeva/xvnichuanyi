import { Resend } from 'resend';

const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is missing');
  }
  return new Resend(apiKey);
};

export const sendWelcomeEmail = async (userEmail: string, userName: string) => {
  const resend = getResendClient();

  const result = await resend.emails.send({
    from: '虚拟换衣 <onboarding@resend.dev>',
    to: 'yangchaoeva@gmail.com',
    subject: '你的虚拟试衣网站',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; color: #0f172a; line-height: 1.7;">
        <h2 style="margin-bottom: 16px;">Hi ${userName}，欢迎来到虚拟换衣！</h2>
        <p>你已经成功注册，现在可以开始你的虚拟试衣体验了。</p>
        <p>上传你的照片，选择你喜欢的服装，看看穿上去是什么效果吧！</p>
        <p>如果有任何问题，随时联系我们。</p>
        <p style="margin-top: 24px;">—— 虚拟换衣团队</p>
      </div>
    `
  });

  if (result.error) {
    throw new Error(result.error.message || 'Failed to send welcome email');
  }

  return result.data;
};
