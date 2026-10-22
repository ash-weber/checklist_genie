
require("dotenv").config();
const { getTransporter, senderFor } = require("../utils/mailer");

const to = process.argv[2];
if (!to) {
  console.log("Usage: node scripts/testZepto.js <your-email>");
  process.exit(1);
}

getTransporter()
  .sendMail({
    from: senderFor("Checklist Genie Test"),
    to,
    subject: "Checklist Genie: mail test",
    html: "<p>Mail is working through the new mailer.</p>",
  })
  .then((r) => console.log("Sent OK:", JSON.stringify(r)))
  .catch((e) => {
    console.error("Failed:", e.message);
    process.exit(1);
  });