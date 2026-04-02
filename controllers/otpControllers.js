import axios from "axios";
import { supabase } from "../config/supabase.js";

// 📲 SEND OTP
export const sendOtp = async (req, res) => {
  const { mobile } = req.body;

  try {
    const response = await axios.post(
      "https://control.msg91.com/api/v5/otp",
      {
        mobile: mobile,
        template_id: process.env.MSG91_TEMPLATE_ID,
      },
      {
        headers: {
          authkey: process.env.MSG91_AUTH_KEY,
        },
      }
    );

    res.json(response.data);
  } catch (err) {
    res.status(500).json(err.response?.data || err.message);
  }
};

// 🔐 VERIFY OTP
export const verifyOtp = async (req, res) => {
  const { mobile, otp } = req.body;

  try {
    const response = await axios.get(
      `https://control.msg91.com/api/v5/otp/verify?mobile=${mobile}&otp=${otp}&authkey=${process.env.MSG91_AUTH_KEY}`
    );

    // 👉 OPTIONAL: Save verified mobile in DB
    if (response.data.type === "success") {
      await supabase.from("verified_users").insert([
        {
          mobile: mobile,
          verified: true,
        },
      ]);
    }

    res.json(response.data);
  } catch (err) {
    res.status(500).json(err.response?.data || err.message);
  }
};