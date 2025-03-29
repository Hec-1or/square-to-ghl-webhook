// ✅ Required modules
const fs = require("fs");
const express = require("express");
const axios = require("axios");
const path = require("path");

const app = express();
const port = 3000;

// ✅ Logging helper
function logToFile(content) {
  const logEntry = `\n[${new Date().toISOString()}]\n${content}\n------------------------\n`;
  fs.appendFileSync("webhook_payloads.log", logEntry);
}

// ✅ Static API Keys
const GHL_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsb2NhdGlvbl9pZCI6IkxDdGJ4MHlxWlY0NXpRcmhaZ3N3IiwidmVyc2lvbiI6MSwiaWF0IjoxNzQzMTE0NjUzOTUyLCJzdWIiOiJzbVN1VWg1UHVZcmtjMkdUcUhjZSJ9.1ug1Yf0YOXvzVE60Wu2lVdqyKGC8dBtHWvZG6kEMwHk"; // Replace with your real GHL key
const SQUARE_ACCESS_TOKEN = "EAAAlxkDRuXNvFfiJUDdqfcKuMv5ovNklo5WLcgw6OhA3GJw0ZTg3kS8sUya0QY-"; // Replace with actual Square token

// ✅ Middleware to parse JSON
app.use("/square-webhook", express.json());

// ✅ Webhook route for Square
app.post("/square-webhook", async (req, res) => {
  console.log("📨 Webhook Received");
  logToFile("📨 Webhook Body:\n" + JSON.stringify(req.body, null, 2));

  const eventType = req.body?.type || "unknown_event";
  const booking = req.body?.data?.object?.booking;
  const customerId = booking?.customer_id;
  const serviceVariationId = booking?.appointment_segments?.[0]?.service_variation_id;
  const teamMemberId = booking?.appointment_segments?.[0]?.team_member_id;

  // 🔄 Map Square Team Member IDs to tag names
  const staffTagMap = {
    "tiy6AkXcGwDKIqmTADFP": "staff_maria_ferrer",
    "TMh40UFdwYtEA5IV": "staff_milay",
    "TMz167qfamP3BQAf": "staff_thalia",
    "i2o7OaHPSgrVvSIsV4RI": "staff_yamile"
  };

  let email = null;
  let phone = null;
  let name = "Unknown";
  let serviceName = "Unknown Service";
  let staffTag = staffTagMap[teamMemberId] || "staff_unknown";

  // 🔍 Step 1: Fetch Service Name (optional but useful)
  if (serviceVariationId) {
    try {
      const catalogRes = await axios.get(
        `https://connect.squareup.com/v2/catalog/object/${serviceVariationId}`,
        {
          headers: {
            Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );
      serviceName = catalogRes.data?.object?.item_variation?.name || "Unknown";
      logToFile("🛍️ SERVICE NAME: " + serviceName);
    } catch (catalogError) {
      logToFile("⚠️ Catalog Error:\n" + JSON.stringify(catalogError.response?.data || catalogError.message, null, 2));
    }
  }

  // 🔍 Step 2: Fetch customer info from Square
  if (customerId) {
    try {
      const customerRes = await axios.get(
        `https://connect.squareup.com/v2/customers/${customerId}`,
        {
          headers: {
            Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );
      const customer = customerRes.data.customer;
      email = customer?.email_address || null;
      phone = customer?.phone_number || null;
      name = `${customer?.given_name || ""} ${customer?.family_name || ""}`.trim();
      logToFile("🙋 CUSTOMER:\n" + JSON.stringify({ name, email, phone }, null, 2));
    } catch (customerErr) {
      logToFile("⚠️ Customer Fetch Error:\n" + JSON.stringify(customerErr.response?.data || customerErr.message, null, 2));
    }
  }

  // ✅ Step 3: Push to GHL
  if (email || phone) {
    try {
      const contactPayload = {
        firstName: name,
        email,
        phone,
        tags: [eventType, serviceName, staffTag]
      };

      const ghlRes = await axios.post(
        "https://rest.gohighlevel.com/v1/contacts/",
        contactPayload,
        {
          headers: {
            Authorization: `Bearer ${GHL_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      const contactId = ghlRes.data.contact.id;
      logToFile("✅ GHL Contact Created: " + contactId);
    } catch (ghlErr) {
      logToFile("❌ GHL Error:\n" + JSON.stringify(ghlErr.response?.data || ghlErr.message, null, 2));
    }
  } else {
    logToFile("⚠️ Skipped GHL creation. No email or phone");
  }

  res.status(200).send("Webhook processed");
});

// ✅ Route to download logs
app.get("/download-log", (req, res) => {
  const filePath = path.join(__dirname, "webhook_payloads.log");
  res.download(filePath, "webhook_payloads.log", (err) => {
    if (err) {
      console.error("❌ Log download failed:", err);
      res.status(500).send("Could not download log file");
    }
  });
});

// ✅ Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
