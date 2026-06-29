const axios = require("axios");

// WARNING: Replace these placeholders with your actual Cashfree API Credentials.
// You can get these in your Cashfree Dashboard > Payment Gateway > Developers > API Keys.
const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID || "YOUR_CASHFREE_APP_ID_HERE";
const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY || "YOUR_CASHFREE_SECRET_KEY_HERE";
const CASHFREE_MODE = process.env.CASHFREE_MODE || "sandbox"; // Change to "production" when launching live

const CASHFREE_API_URL = CASHFREE_MODE === "production"
  ? "https://api.cashfree.com/pg/orders"
  : "https://sandbox.cashfree.com/pg/orders";

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle OPTIONS preflight request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const { orderAmount, orderCurrency, customerId, customerPhone, customerEmail } = req.body;

  if (!orderAmount) {
    return res.status(400).json({ error: "orderAmount is required." });
  }

  try {
    const orderPayload = {
      order_amount: Number(orderAmount),
      order_currency: orderCurrency || "INR",
      customer_details: {
        customer_id: customerId || "guest_customer",
        customer_phone: customerPhone || "9999999999",
        customer_email: customerEmail || "guest@zzrestaurant.com"
      }
    };

    console.log("Calling Cashfree API...");
    const response = await axios.post(CASHFREE_API_URL, orderPayload, {
      headers: {
        "x-client-id": CASHFREE_APP_ID,
        "x-client-secret": CASHFREE_SECRET_KEY,
        "x-api-version": "2023-08-01",
        "Content-Type": "application/json"
      }
    });

    console.log("Cashfree session generated successfully.");

    return res.status(200).json({
      payment_session_id: response.data.payment_session_id,
      order_id: response.data.order_id
    });

  } catch (error) {
    console.error("Cashfree API Request failed:", error.response ? error.response.data : error.message);

    // If keys are not replaced, return a friendly mock fallback for easy local developer testing
    if (CASHFREE_APP_ID === "YOUR_CASHFREE_APP_ID_HERE") {
      return res.status(200).json({
        payment_session_id: "cf_demo_session_" + Math.random().toString(36).substr(2, 9),
        message: "Running in Function Demo Mode because API keys are placeholders."
      });
    }

    return res.status(500).json({
      error: "Cashfree API request failed",
      details: error.response ? error.response.data : error.message
    });
  }
};
