
const { sendMail: zeptoSend } = require("./zeptoMailer");

const getTransporter = () => {
  if (!process.env.ZEPTOMAIL_TOKEN) {
    throw new Error(
      "ZeptoMail is not configured. Please set ZEPTOMAIL_TOKEN in the server environment."
    );
  }

  return {
    sendMail: async (opts) => {
      const fromName =
        opts.from && typeof opts.from === "object"
          ? opts.from.name
          : undefined;

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
};

const senderFor = (name) => ({
  name,
  address:
    process.env.ZEPTOMAIL_FROM_EMAIL ||
    process.env.MAIL_FROM,
});

module.exports = { getTransporter, senderFor };
