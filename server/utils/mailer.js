
const nodemailer = require("nodemailer");
const { sendMail: zeptoSend } = require("./zeptoMailer");

let transporter = null;

const zeptoTransport = {
  sendMail: async (opts) => {
    const fromName = opts.from && typeof opts.from === "object" ? opts.from.name : undefined;
    return zeptoSend({
      to: opts.to,
      cc: opts.cc,
      bcc: opts.bcc,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      fromName,
    });
  },
};

const getTransporter = () => {
  if (transporter) return transporter;

  if (process.env.ZEPTOMAIL_TOKEN) {
    transporter = zeptoTransport;
  } else if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE) === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10000,
      socketTimeout: 15000,
    });
  } else {
    console.warn(
      "No ZEPTOMAIL_TOKEN / SMTP_HOST set - falling back to the Gmail transporter." +
        (process.env.NODE_ENV === "production"
          ? " On Render this will fail (SMTP ports are blocked on the free plan). Set ZEPTOMAIL_* env vars."
          : "")
    );
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.OUTLOOK_EMAIL, pass: process.env.OUTLOOK_PASSWORD },
      connectionTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transporter;
};

const senderFor = (name) => ({
  name,
  address:
    process.env.ZEPTOMAIL_FROM_EMAIL ||
    process.env.MAIL_FROM ||
    process.env.SMTP_USER ||
    process.env.OUTLOOK_EMAIL,
});

module.exports = { getTransporter, senderFor };