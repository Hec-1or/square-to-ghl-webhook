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

// ✅ GHL & Square tokens
const GHL_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsb2NhdGlvbl9pZCI6IkxDdGJ4MHlxWlY0NXpRcmhaZ3N3IiwidmVyc2lvbiI6MSwiaWF0IjoxNzQzMTE0NjUzOTUyLCJzdWIiOiJzbVN1VWg1UHVZcmtjMkdUcUhjZSJ9.1ug1Yf0YOXvzVE60Wu2lVdqyKGC8dBtHWvZG6kEMwHk";
const SQUARE_ACCESS_TOKEN = "EAAAlxkDRuXNvFfiJUDdqfcKuMv5ovNklo5WLcgw6OhA3GJw0ZTg3kS8sUya0QY-";

// ✅ JSON parsing middleware
app.use("/square-webhook", express.json());

// ✅ Square webhook handler
app.post("/square-webhook", async (req, res) => {
  console.log("📨 Webhook Received");
  logToFile("📨 Webhook Body:\n" + JSON.stringify(req.body, null, 2));

  const eventType = req.body?.type || "unknown_event";
  const booking = req.body?.data?.object?.booking;
  const customerId = booking?.customer_id;
  const serviceVariationId = booking?.appointment_segments?.[0]?.service_variation_id;
  const teamMemberId = booking?.appointment_segments?.[0]?.team_member_id;

  let serviceName = "Unknown Service";
  let staffName = "Unknown Staff";
  let email = null;
  let phone = null;
  let name = "Unknown";

  // ✅ Fetch staff name from Square
  if (teamMemberId) {
    try {
      const teamRes = await axios.get(`https://connect.squareup.com/v2/team-members/${teamMemberId}`, {
        headers: {
          Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      });
      staffName = teamRes.data?.team_member?.display_name || "Unknown";
      console.log("👤 Staff:", staffName);
      logToFile("👤 Staff Name: " + staffName);
    } catch (err) {
      logToFile("⚠️ Staff Lookup Error:\n" + JSON.stringify(err.response?.data || err.message, null, 2));
    }
  }

  // ✅ Fetch full service name (variation + item)
  if (serviceVariationId) {
    try {
      const variationRes = await axios.get(`https://connect.squareup.com/v2/catalog/object/${serviceVariationId}`, {
        headers: {
          Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      });
      const variation = variationRes.data?.object?.item_variation_data;
      const variationName = variation?.name || "Unknown Variation";
      const itemId = variation?.item_id;

      if (itemId) {
        const itemRes = await axios.get(`https://connect.squareup.com/v2/catalog/object/${itemId}`, {
          headers: {
            Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        });
        const itemName = itemRes.data?.object?.item_data?.name || "Unknown Item";
        serviceName = `${itemName} - ${variationName}`;
      } else {
        serviceName = variationName;
      }

      console.log("🛍️ Service:", serviceName);
      logToFile("🛍️ Service Name: " + serviceName);
    } catch (err) {
      logToFile("⚠️ Service Lookup Error:\n" + JSON.stringify(err.response?.data || err.message, null, 2));
    }
  }

  // ✅ Fetch customer
  if (customerId) {
    try {
      const customerRes = await axios.get(`https://connect.squareup.com/v2/customers/${customerId}`, {
        headers: {
          Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      });
      const customer = customerRes.data?.customer;
      email = customer?.email_address;
      phone = customer?.phone_number;
      name = `${customer?.given_name || ""} ${customer?.family_name || ""}`.trim();
      logToFile("🙋 Customer:\n" + JSON.stringify({ name, email, phone }, null, 2));
    } catch (err) {
      logToFile("⚠️ Customer Lookup Error:\n" + JSON.stringify(err.response?.data || err.message, null, 2));
    }
  }

  // ✅ Send to GHL
  if (email || phone) {
    try {
      const payload = {
        firstName: name,
        email,
        phone,
        tags: [eventType, serviceName, staffName],
      };
      const ghlRes = await axios.post("https://rest.gohighlevel.com/v1/contacts/", payload, {
        headers: {
          Authorization: `Bearer ${GHL_API_KEY}`,
          "Content-Type": "application/json",
        },
      });
      const contactId = ghlRes.data?.contact?.id;
      logToFile("✅ GHL Contact Created: " + contactId);
    } catch (err) {
      logToFile("❌ GHL Error:\n" + JSON.stringify(err.response?.data || err.message, null, 2));
    }
  } else {
    logToFile("⚠️ No email or phone. Skipping GHL.");
  }

  res.status(200).send("OK");
});

// ✅ Log download
app.get("/download-log", (req, res) => {
  const filePath = path.join(__dirname, "webhook_payloads.log");
  res.download(filePath);
});

// ✅ Start server
app.listen(port, () => {
  console.log(`🚀 Listening on port ${port}`);
});