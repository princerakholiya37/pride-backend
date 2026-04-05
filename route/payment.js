const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const supabase = require("../supabaseClient");

const router = express.Router();

const RAZORPAY_API_BASE_URL = "https://api.razorpay.com/v1";

const getRazorpayCredentials = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials are not configured");
  }

  return { keyId, keySecret };
};

const normalizeAmount = (amount) => {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return null;
  }

  return Math.round(numericAmount * 100);
};

const normalizeOrderItems = (items = []) =>
  Array.isArray(items)
    ? items
        .map((item) => ({
          product_id: item.id ? String(item.id) : null,
          name: String(item.name || "").trim(),
          quantity: Math.max(1, Number(item.quantity) || 1),
          price: Number(item.price) || 0,
          image: String(item.image || "").trim(),
          category: String(item.category || "").trim(),
        }))
        .filter((item) => item.name && item.price >= 0)
    : [];

router.post("/create-order", async (req, res) => {
  const { amount, items = [], customer = {} } = req.body;
  const amountInPaise = normalizeAmount(amount);

  if (!amountInPaise) {
    return res.status(400).json({
      success: false,
      message: "A valid payment amount is required.",
    });
  }

  try {
    const { keyId, keySecret } = getRazorpayCredentials();
    const receipt = `pride_${Date.now()}`;

    const { data } = await axios.post(
      `${RAZORPAY_API_BASE_URL}/orders`,
      {
        amount: amountInPaise,
        currency: "INR",
        receipt,
        notes: {
          item_count: String(items.length || 0),
          customer_name: customer.name || "",
          customer_email: customer.email || "",
        },
      },
      {
        auth: {
          username: keyId,
          password: keySecret,
        },
      },
    );

    return res.json({
      success: true,
      keyId,
      order: data,
    });
  } catch (error) {
    const errorMessage =
      error.response?.data?.error?.description ||
      error.response?.data?.error?.reason ||
      error.response?.data?.message ||
      error.message ||
      "Unable to start payment right now.";

    console.error(
      "Failed to create Razorpay order",
      error.response?.data || error.message,
    );

    return res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
});

router.post("/verify", async (req, res) => {
  const {
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: razorpaySignature,
    amount,
    customer = {},
    shippingAddress = {},
    items = [],
  } = req.body;

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return res.status(400).json({
      success: false,
      message: "Payment verification details are missing.",
    });
  }

  try {
    const { keySecret } = getRazorpayCredentials();

    const generatedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (generatedSignature !== razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: "Payment signature verification failed.",
      });
    }

    const normalizedItems = normalizeOrderItems(items);
    const normalizedAmount = Number(amount) || 0;
    const normalizedEmail = String(customer.email || "")
      .trim()
      .toLowerCase();
    const normalizedContact = String(customer.contact || "").trim();
    const normalizedName = String(customer.name || "").trim();
    const normalizedAddress = String(shippingAddress.address || "").trim();
    const normalizedLandmark = String(shippingAddress.landmark || "").trim();
    const normalizedCity = String(shippingAddress.city || "").trim();
    const normalizedState = String(shippingAddress.state || "").trim();
    const normalizedPostalCode = String(shippingAddress.postalCode || "").trim();

    let userId = null;

    if (normalizedEmail) {
      const { data: userRecord } = await supabase
        .from("users")
        .select("id")
        .eq("email", normalizedEmail)
        .maybeSingle();

      userId = userRecord?.id || null;
    }

    const orderPayload = {
      user_id: userId,
      customer_name: normalizedName,
      customer_email: normalizedEmail || null,
      customer_mobile: normalizedContact || null,
      shipping_address: normalizedAddress,
      landmark: normalizedLandmark || null,
      city: normalizedCity,
      state: normalizedState,
      postal_code: normalizedPostalCode,
      amount: normalizedAmount,
      currency: "INR",
      payment_status: "paid",
      order_status: "confirmed",
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
      items: normalizedItems,
      item_count: normalizedItems.reduce(
        (total, item) => total + Number(item.quantity || 0),
        0,
      ),
      paid_at: new Date().toISOString(),
    };

    const { data: savedOrder, error: saveOrderError } = await supabase
      .from("orders")
      .insert(orderPayload)
      .select("id, created_at")
      .single();

    if (saveOrderError) {
      console.error("Failed to save paid order", saveOrderError);

      return res.status(500).json({
        success: false,
        message:
          saveOrderError.message ||
          "Payment verified, but order saving failed.",
      });
    }

    return res.json({
      success: true,
      message: "Payment verified successfully.",
      paymentId: razorpayPaymentId,
      orderId: razorpayOrderId,
      savedOrderId: savedOrder.id,
    });
  } catch (error) {
    console.error("Failed to verify Razorpay payment", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to verify payment right now.",
    });
  }
});

module.exports = router;
