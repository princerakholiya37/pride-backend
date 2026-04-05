const express = require("express");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const transporter = require("../utils/mailer");
const supabase = require("../supabaseClient");
const crypto = require("crypto");

dotenv.config();

const router = express.Router();
const otpStore = {};
const signupVerificationStore = {};

const normalizeEmail = (email = "") => email.trim().toLowerCase();

const isValidEmail = (email = "") =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

router.get("/profile", async (req, res) => {
  const normalizedEmail = normalizeEmail(req.query.email);

  if (!normalizedEmail) {
    return res.status(400).json({
      success: false,
      message: "Email is required.",
    });
  }

  try {
    const { data: user, error } = await supabase
      .from("users")
      .select(
        "id, name, email, mobile, role, address, city, state, postal_code",
      )
      .eq("email", normalizedEmail)
      .single();

    if (error || !user) {
      return res.status(404).json({
        success: false,
        message: "User profile not found.",
      });
    }

    return res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.log("PROFILE FETCH ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load profile right now.",
    });
  }
});

router.patch("/profile", async (req, res) => {
  const normalizedEmail = normalizeEmail(req.body.email);
  const name = String(req.body.name || "").trim();
  const mobile = String(req.body.mobile || "").trim();
  const address = String(req.body.address || "").trim();
  const city = String(req.body.city || "").trim();
  const state = String(req.body.state || "").trim();
  const postalCode = String(req.body.postalCode || "").trim();

  if (!normalizedEmail || !name || !mobile) {
    return res.status(400).json({
      success: false,
      message: "Name, email, and mobile are required.",
    });
  }

  const mobileRegex = /^[6-9]\d{9}$/;

  if (!mobileRegex.test(mobile)) {
    return res.status(400).json({
      success: false,
      message: "Enter valid 10-digit mobile number starting with 6-9",
    });
  }

  try {
    const { data: currentUser, error: currentUserError } = await supabase
      .from("users")
      .select("id, email")
      .eq("email", normalizedEmail)
      .single();

    if (currentUserError || !currentUser) {
      return res.status(404).json({
        success: false,
        message: "User profile not found.",
      });
    }

    const { data: existingMobile } = await supabase
      .from("users")
      .select("id")
      .eq("mobile", mobile)
      .neq("email", normalizedEmail)
      .maybeSingle();

    if (existingMobile) {
      return res.status(400).json({
        success: false,
        message: "Mobile already registered with another account.",
      });
    }

    const { data: updatedUser, error: updateError } = await supabase
      .from("users")
      .update({
        name,
        mobile,
        address,
        city,
        state,
        postal_code: postalCode,
      })
      .eq("email", normalizedEmail)
      .select(
        "id, name, email, mobile, role, address, city, state, postal_code",
      )
      .single();

    if (updateError) {
      return res.status(500).json({
        success: false,
        message: updateError.message || "Unable to update profile.",
      });
    }

    return res.json({
      success: true,
      message: "Profile updated successfully.",
      user: updatedUser,
    });
  } catch (error) {
    console.log("PROFILE UPDATE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update profile right now.",
    });
  }
});

router.post("/signup", async (req, res) => {
  const { name, email, password, mobile } = req.body;

  const normalizedEmail = normalizeEmail(email);

  if (!name || !normalizedEmail || !password) {
    return res.json({
      success: false,
      message: "All required fields must be filled",
    });
  }

  if (password.length < 6) {
    return res.json({
      success: false,
      message: "Password must be at least 6 characters",
    });
  }

  if (!isValidEmail(normalizedEmail)) {
    return res.json({
      success: false,
      message: "Enter a valid email address",
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

  const signupVerification = signupVerificationStore[normalizedEmail];

  if (!signupVerification || Date.now() > signupVerification.expiresAt) {
    delete signupVerificationStore[normalizedEmail];
    return res.json({
      success: false,
      message: "Please verify your email with OTP before signup",
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const { data: existingEmail } = await supabase
      .from("users")
      .select("email")
      .eq("email", normalizedEmail)
      .single();

    if (existingEmail) {
      return res.json({
        success: false,
        message: "Email already registered",
      });
    }

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

    const { error } = await supabase.from("users").insert([
      {
        id: crypto.randomUUID(),
        name,
        email: normalizedEmail,
        password: hashedPassword,
        mobile,
        role: "user",
        is_verified: true,
      },
    ]);

    if (error) {
      return res.json({
        success: false,
        message: "Database error",
      });
    }

    delete signupVerificationStore[normalizedEmail];

    return res.json({
      success: true,
      message: "Account created successfully",
    });
  } catch (err) {
    console.log("SIGNUP ERROR:", err);
    return res.json({
      success: false,
      message: "Signup failed",
    });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const normalizedEmail = normalizeEmail(email);

  try {
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("email", normalizedEmail)
      .single();

    if (!user) {
      return res.json({
        success: false,
        message: "User not found",
      });
    }

    if (!["user", "admin"].includes(user.role)) {
      return res.json({
        success: false,
        message: "This account role is no longer supported",
      });
    }

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
    console.log("LOGIN ERROR:", err);
    return res.json({
      success: false,
      message: "Login failed",
    });
  }
});

router.post("/send-otp", async (req, res) => {
  console.log("SEND OTP API HIT");
  const { email } = req.body;
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return res.json({ success: false, message: "Email required" });
  }

  if (!isValidEmail(normalizedEmail)) {
    return res.json({ success: false, message: "Enter a valid email address" });
  }

  const { data: existingEmail, error: existingEmailError } = await supabase
    .from("users")
    .select("email")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existingEmailError) {
    console.log("CHECK EMAIL ERROR:", existingEmailError);
    return res.json({ success: false, message: "Unable to process email right now" });
  }

  if (existingEmail) {
    return res.json({ success: false, message: "Email already registered" });
  }

  const otp = generateOtp();

  otpStore[normalizedEmail] = {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000,
    purpose: "signup",
  };

  try {
    await transporter.sendMail({
      from: `"PRide" <${process.env.EMAIL_USER}>`,
      to: normalizedEmail,
      subject: "PRide OTP Verification",
      html: `<h2>Your OTP is: ${otp}</h2><p>Valid for 5 minutes</p>`,
    });

    return res.json({ success: true, message: "OTP sent" });
  } catch (err) {
    console.log("EMAIL ERROR:", err);
    return res.json({ success: false, message: "Email send failed" });
  }
});

router.post("/verify-signup", async (req, res) => {
  const { email, otp } = req.body;
  const normalizedEmail = normalizeEmail(email);
  const normalizedOtp = String(otp || "").trim();

  const record = otpStore[normalizedEmail];

  if (!record) {
    return res.json({ success: false, message: "OTP not found" });
  }

  if (Date.now() > record.expiresAt) {
    delete otpStore[normalizedEmail];
    return res.json({ success: false, message: "OTP expired" });
  }

  if (record.purpose !== "signup") {
    return res.json({ success: false, message: "Invalid OTP request" });
  }

  if (record.otp !== normalizedOtp) {
    return res.json({ success: false, message: "Invalid OTP" });
  }

  delete otpStore[normalizedEmail];
  signupVerificationStore[normalizedEmail] = {
    verified: true,
    expiresAt: Date.now() + 10 * 60 * 1000,
  };

  return res.json({
    success: true,
    message: "Email verified successfully",
  });
});

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return res.json({ success: false, message: "Email required" });
  }

  if (!isValidEmail(normalizedEmail)) {
    return res.json({ success: false, message: "Enter a valid email address" });
  }

  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", normalizedEmail)
      .single();

    if (error || !user) {
      return res.json({ success: false, message: "User not found" });
    }

    const otp = generateOtp();

    otpStore[normalizedEmail] = {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
      purpose: "forgot-password",
    };

    await transporter.sendMail({
      from: `"PRide" <${process.env.EMAIL_USER}>`,
      to: normalizedEmail,
      subject: "Reset Password OTP",
      html: `<h2>Your OTP is: ${otp}</h2><p>Valid for 5 minutes</p>`,
    });

    return res.json({ success: true, message: "OTP sent to email" });
  } catch (err) {
    console.log(err);
    return res.json({ success: false, message: "Server error" });
  }
});

router.post("/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;

  const normalizedEmail = normalizeEmail(email);
  const normalizedOtp = String(otp || "").trim();

  try {
    const record = otpStore[normalizedEmail];

    if (!record) {
      return res.json({ success: false, message: "OTP not found" });
    }

    if (record.purpose !== "forgot-password") {
      return res.json({ success: false, message: "Invalid OTP request" });
    }

    if (record.otp !== normalizedOtp) {
      return res.json({ success: false, message: "Invalid OTP" });
    }

    if (Date.now() > record.expiresAt) {
      delete otpStore[normalizedEmail];
      return res.json({ success: false, message: "OTP expired" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const { error } = await supabase
      .from("users")
      .update({ password: hashedPassword })
      .eq("email", normalizedEmail);

    if (error) {
      return res.json({ success: false, message: "Update failed" });
    }

    delete otpStore[normalizedEmail];

    return res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    console.log(err);
    return res.json({ success: false, message: "Server error" });
  }
});

module.exports = router;
