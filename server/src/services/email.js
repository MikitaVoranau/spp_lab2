const nodemailer = require('nodemailer');
const logger = require('../logger');

function createTransport() {
  const options = {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '1025', 10),
    secure: false,
  };

  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    options.auth = {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    };
  }

  return nodemailer.createTransport(options);
}

async function sendPasswordResetEmail(toEmail, resetToken) {
  const resetUrl = `http://localhost:8080/?token=${resetToken}`;
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
        <p style="margin:20px 0;">
          <a href="${resetUrl}" style="background:#4f46e5;color:#ffffff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">
            Сбросить пароль
          </a>
        </p>
        <p>Или перейдите по прямой ссылке: <br/><a href="${resetUrl}">${resetUrl}</a></p>
        <p>Токен сброса: <code>${resetToken}</code></p>
        <p>Ссылка действует ${process.env.RESET_TOKEN_EXPIRES_MINUTES || 30} минут.</p>
        <p>Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо.</p>
      `,
    });
    logger.info('Password reset email sent', { to: toEmail });
  } catch (err) {
    logger.error('Failed to send password reset email via SMTP', { to: toEmail, error: err.message });
  }
}

module.exports = { sendPasswordResetEmail };
