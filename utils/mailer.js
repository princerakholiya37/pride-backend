const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail", // 👈 IMPORTANT (host hatao)
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify((err, success) => {
  if (err) {
    console.log("❌ MAIL ERROR:", err);
  } else {
    console.log("✅ Mail server ready");
  }
});

module.exports = transporter;