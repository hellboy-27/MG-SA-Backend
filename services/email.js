const https = require('https');

class EmailService {
  constructor() {
    this.apiKey = process.env.BREVO_API_KEY;
    this.sender = process.env.SMTP_SENDER || 'taskvibe.admo@gmail.com';
    this.senderName = process.env.SMTP_SENDER_NAME || 'MG-SA Definitive Mods';
  }

  async sendEmail({ to, subject, htmlContent }) {
    if (!this.apiKey) {
      console.log(`[EMAIL] No API key. Code for ${to}: ${subject}`);
      return { success: true, simulated: true };
    }

    const payload = JSON.stringify({
      sender: { email: this.sender, name: this.senderName },
      to: [{ email: to }],
      subject: subject,
      htmlContent: htmlContent
    });

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.brevo.com',
        port: 443,
        path: '/v3/smtp/email',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey,
          'accept': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[EMAIL] Sent to ${to}`);
            resolve({ success: true });
          } else {
            console.error(`[EMAIL] Error ${res.statusCode}:`, data);
            reject(new Error(`Email failed: ${res.statusCode}`));
          }
        });
      });

      req.on('error', (err) => {
        console.error('[EMAIL] Request error:', err.message);
        reject(err);
      });

      req.write(payload);
      req.end();
    });
  }

  async sendPasswordResetCode(email, code) {
    const htmlContent = `
      <div style="font-family:Arial,sans-serif;max-width:400px;margin:0 auto;padding:20px;background:#0a0a0f;color:#ece2c8;border-radius:8px">
        <h2 style="color:#ff6b35;text-align:center">MG-SA Definitive Mods</h2>
        <p style="text-align:center;font-size:14px">Tu codigo de verificacion es:</p>
        <div style="text-align:center;margin:20px 0">
          <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#ffc247;background:#1c1626;padding:12px 24px;border-radius:8px">${code}</span>
        </div>
        <p style="text-align:center;font-size:12px;color:#a89cb0">Este codigo expira en 15 minutos.</p>
        <p style="text-align:center;font-size:12px;color:#6b5f7b">Si no solicitaste este cambio, ignora este mensaje.</p>
      </div>
    `;

    return this.sendEmail({
      to: email,
      subject: 'MG-SA - Codigo de verificacion',
      htmlContent
    });
  }
}

module.exports = new EmailService();
