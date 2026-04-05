const express = require("express");
const supabase = require("../supabaseClient");

const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, name, email, mobile, role, address, city, state, postal_code")
      .eq("role", "user")
      .order("name", { ascending: true });

    if (usersError) {
      throw usersError;
    }

    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id, customer_email, amount, order_status, created_at, item_count");

    if (ordersError) {
      throw ordersError;
    }

    const customerList = (users || []).map((user) => {
      const customerOrders = (orders || []).filter(
        (order) =>
          String(order.customer_email || "").trim().toLowerCase() ===
          String(user.email || "").trim().toLowerCase(),
      );

      const totalSpent = customerOrders.reduce(
        (total, order) => total + Number(order.amount || 0),
        0,
      );

      const totalItems = customerOrders.reduce(
        (total, order) => total + Number(order.item_count || 0),
        0,
      );

      const latestOrder = [...customerOrders].sort(
        (left, right) =>
          new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
      )[0];

      return {
        ...user,
        orders_count: customerOrders.length,
        total_spent: totalSpent,
        total_items: totalItems,
        latest_order_at: latestOrder?.created_at || null,
        latest_order_status: latestOrder?.order_status || "No orders",
      };
    });

    return res.json({
      success: true,
      customers: customerList,
    });
  } catch (error) {
    console.error("Failed to load customers", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to load customers right now.",
    });
  }
});

module.exports = router;
