const express = require("express");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const transporter = require("../utils/mailer");
const supabase = require("../supabaseClient");
const crypto = require("crypto");

dotenv.config();

const router = express.Router();

// OTP STORE
const otpStore = {};

// SEND OTP
router.post("/send-otp", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.json({ success: false, message: "Email required" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000);

  otpStore[email] = {
    otp,
    expires: Date.now() + 5 * 60 * 1000,
  };

  try {
    await transporter.sendMail({
      from: `"PRide" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "PRide OTP Verification",
      html: `<h2>Your OTP is: ${otp}</h2>`,
    });

    res.json({ success: true, message: "OTP sent" });
  } catch (err) {
    res.json({ success: false, message: "Email send failed" });
  }
});

// VERIFY OTP + SIGNUP

router.post("/verify-signup", async (req, res) => {
  const { email, otp } = req.body;

  const record = otpStore[email];

  if (!record) {
    return res.json({ success: false, message: "OTP not found" });
  }

  if (Date.now() > record.expires) {
    return res.json({ success: false, message: "OTP expired" });
  }

  if (record.otp != otp) {
    return res.json({ success: false, message: "Invalid OTP" });
  }

  delete otpStore[email];

  return res.json({
    success: true,
    message: "Email verified successfully",
  });
});

router.post("/signup", async (req, res) => {
  const {
    name,
    email,
    password,
    mobile,
    role,
    vehicle_type,
    vehicle_number,
  } = req.body;

  // VALIDATION
  if (!name || !email || !password) {
    return res.json({
      success: false,
      message: "All required fields must be filled",
    });
  }

  if (!password || password.length < 6) {
    return res.json({
      success: false,
      message: "Password must be at least 6 characters",
    });
  }

  const mobileRegex = /^[6-9]\d{9}$/;

  if (!mobile) {
    return res.json({
      success: false,
      message: "Mobile number is required",
    });
  }

  if (!mobileRegex.test(mobile)) {
    return res.json({
      success: false,
      message: "Enter valid 10-digit mobile number starting with 6-9",
    });
  }

  if (role === "driver" && (!vehicle_type || !vehicle_number)) {
    return res.json({
      success: false,
      message: "Driver details required",
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    // email check
    const { data: existingEmail } = await supabase
      .from("users")
      .select("email")
      .eq("email", email)
      .single();

    if (existingEmail) {
      return res.json({
        success: false,
        message: "Email already registered",
      });
    }

    // mobile check
    if (mobile) {
      const { data: existingMobile } = await supabase
        .from("users")
        .select("mobile")
        .eq("mobile", mobile)
        .single();

      if (existingMobile) {
        return res.json({
          success: false,
          message: "Mobile already registered",
        });
      }
    }

    // insert
    const { error } = await supabase.from("users").insert([
      {
        id: crypto.randomUUID(),
        name,
        email,
        password: hashedPassword,
        mobile,
        role,
        vehicle_type: role === "driver" ? vehicle_type : null,
        vehicle_number: role === "driver" ? vehicle_number : null,
        is_verified: true,
      },
    ]);

    if (error) {
      return res.json({
        success: false,
        message: "Database error",
      });
    }

    return res.json({
      success: true,
      message: "Account created successfully",
    });

  } catch (err) {
    return res.json({
      success: false,
      message: "Signup failed",
    });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  // 🔥 ADMIN LOGIN (FIXED)
  if (email === "admin@gmail.com" && password === "admin123") {
    return res.json({
      success: true,
      role: "admin",
    });
  }

  try {
    // 🔍 find user
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (!user) {
      return res.json({
        success: false,
        message: "User not found",
      });
    }

    // 🔐 check password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.json({
        success: false,
        message: "Invalid password",
      });
    }

    return res.json({
      success: true,
      role: user.role,
      user,
    });

  } catch (err) {
    return res.json({
      success: false,
      message: "Login failed",
    });
  }
});

module.exports = router;