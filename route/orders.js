const express = require("express");
const supabase = require("../supabaseClient");

const router = express.Router();
const updatableStatuses = ["confirmed", "packed", "shipped", "delivered"];

const applyStatusTimestamps = (status) => {
  const now = new Date().toISOString();

  switch (status) {
    case "packed":
      return { order_status: status, packed_at: now };
    case "shipped":
      return { order_status: status, shipped_at: now };
    case "delivered":
      return { order_status: status, delivered_at: now };
    default:
      return { order_status: status };
  }
};

router.get("/mine", async (req, res) => {
  const email = String(req.query.email || "")
    .trim()
    .toLowerCase();

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required to fetch orders.",
    });
  }

  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("customer_email", email)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return res.json({
      success: true,
      orders: data || [],
    });
  } catch (error) {
    console.error("Failed to fetch user orders", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to load orders right now.",
    });
  }
});

router.get("/all", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return res.json({
      success: true,
      orders: data || [],
    });
  } catch (error) {
    console.error("Failed to fetch all orders", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to load orders right now.",
    });
  }
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      throw error;
    }

    return res.json({
      success: true,
      order: data,
    });
  } catch (error) {
    console.error("Failed to fetch order", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to load this order right now.",
    });
  }
});

router.patch("/:id/status", async (req, res) => {
  const { id } = req.params;
  const status = String(req.body.status || "").trim().toLowerCase();

  if (!updatableStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid status selected.",
    });
  }

  try {
    const { data: currentOrder, error: currentOrderError } = await supabase
      .from("orders")
      .select("id, order_status")
      .eq("id", id)
      .single();

    if (currentOrderError) {
      throw currentOrderError;
    }

    if (currentOrder.order_status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cancelled orders cannot be updated.",
      });
    }

    const { data, error } = await supabase
      .from("orders")
      .update(applyStatusTimestamps(status))
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return res.json({
      success: true,
      order: data,
    });
  } catch (error) {
    console.error("Failed to update order status", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to update order status right now.",
    });
  }
});

router.patch("/:id/cancel", async (req, res) => {
  const { id } = req.params;
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required to cancel this order.",
    });
  }

  try {
    const { data: currentOrder, error: currentOrderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (currentOrderError) {
      throw currentOrderError;
    }

    if (currentOrder.customer_email !== email) {
      return res.status(403).json({
        success: false,
        message: "You cannot cancel someone else's order.",
      });
    }

    if (["packed", "shipped", "delivered"].includes(currentOrder.order_status)) {
      return res.status(400).json({
        success: false,
        message: "Order can only be cancelled before packing starts.",
      });
    }

    if (currentOrder.order_status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "This order is already cancelled.",
      });
    }

    const { data, error } = await supabase
      .from("orders")
      .update({
        order_status: "cancelled",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return res.json({
      success: true,
      order: data,
    });
  } catch (error) {
    console.error("Failed to cancel order", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to cancel order right now.",
    });
  }
});

module.exports = router;
