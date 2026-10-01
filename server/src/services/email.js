const nodemailer = require('nodemailer');
const logger = require('../logger');

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendPasswordResetEmail(toEmail, resetToken) {
  const resetUrl = `http://localhost:8080/?token=${resetToken}`;
  const isDummySmtp = !process.env.SMTP_USER || process.env.SMTP_USER === 'your_email@gmail.com';

  if (isDummySmtp) {
    logger.info('Password reset token generated (dev mode)', { to: toEmail, resetUrl, resetToken });
    return;
  }

  const transporter = createTransport();

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'no-reply@producthub.local',
      to: toEmail,
      subject: 'Восстановление доступа — ProductHub',
      html: `
        <h2>Восстановление пароля</h2>
        <p>Вы запросили сброс пароля для вашего аккаунта ProductHub.</p>
        <p>Нажмите на ссылку ниже для установки нового пароля:</p>
        <a href="${resetUrl}" style="background:#4f46e5;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block">
          Сбросить пароль
        </a>
        <p>Ссылка действует ${process.env.RESET_TOKEN_EXPIRES_MINUTES || 30} минут.</p>
        <p>Токен сброса: <code>${resetToken}</code></p>
        <p>Если вы не запрашивали сброс пароля — проигнорируйте это письмо.</p>
      `,
    });
    logger.info('Password reset email sent', { to: toEmail });
  } catch (err) {
    logger.warn('Failed to send password reset email via SMTP', { to: toEmail, resetToken, error: err.message });
  }
}

module.exports = { sendPasswordResetEmail };
