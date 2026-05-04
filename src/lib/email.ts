import { Resend } from 'resend';

// 获取 Resend 客户端实例
const getResendClient = () => {
  // 从环境变量中读取并去除空格
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    // 如果 API 密钥缺失，抛出错误
    throw new Error('RESEND_API_KEY is missing');
  }
  // 返回新的 Resend 实例
  return new Resend(apiKey);
};

// 发送欢迎邮件
export const sendWelcomeEmail = async (userEmail: string, userName: string) => {
  // 获取 Resend 客户端
  const resend = getResendClient();

  // 发送邮件
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

  // 如果发送失败，抛出错误
  if (result.error) {
    throw new Error(result.error.message || 'Failed to send welcome email');
  }

  // 返回发送结果数据
  return result.data;
};
