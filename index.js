const fs = require('fs');
const express = require("express");
const axios = require("axios");
const path = require('path');

const app = express();
const port = 3000;

// ✅ Logging helper
function logToFile(content) {
  const logEntry = `\n[${new Date().toISOString()}]\n${content}\n------------------------\n`;
  fs.appendFileSync("webhook_payloads.log", logEntry);
}

// ✅ Your API keys
const SQUARE_ACCESS_TOKEN = "EAAAlzn7ojeRCtAp1T7d-lSeeJa_TcmepPsDEYY5d6D3rOVvoZpz5xSdH8wE8LEv";
const GHL_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsb2NhdGlvbl9pZCI6IkxDdGJ4MHlxWlY0NXpRcmhaZ3N3IiwidmVyc2lvbiI6MSwiaWF0IjoxNzQzMTE0NjUzOTUyLCJzdWIiOiJzbVN1VWg1UHVZcmtjMkdUcUhjZSJ9.1ug1Yf0YOXvzVE60Wu2lVdqyKGC8dBtHWvZG6kEMwHk";

// ✅ Middleware
app.use("/square-webhook", express.json());

// ✅ Webhook route
app.post("/square-webhook", async (req, res) => {
  console.log("🧾 Payload received:");
  const payload = JSON.stringify(req.body, null, 2);
  logToFile("📦 PAYLOAD:\n" + payload);

  const eventType = req.body?.type || "unknown_event";
  const booking = req.body?.data?.object?.booking;
  const customerId = booking?.customer_id;

  console.log("📅 Event:", eventType);
  console.log("🆔 Customer ID:", customerId);

  try {
    // 🔍 Step 1: Fetch customer info from Square
    let email = null;
    let phone = null;
    let name = "Unknown";
    // 🔍 Step 2: Look up service name using Catalog API
let serviceName = "Unknown Service";
const serviceVariationId = booking?.appointment_segments?.[0]?.service_variation_id;

if (serviceVariationId) {
  try {
    const catalogRes = await axios.get(
      `https://connect.squareup.com/v2/catalog/object/${serviceVariationId}`,
      {
        headers: {
          Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    serviceName = catalogRes.data?.object?.item_variation?.name || "Unknown";
    console.log("🛍️ Service Name:", serviceName);
    logToFile("🛍️ SERVICE NAME: " + serviceName);
  } catch (catalogError) {
    logToFile("⚠️ Failed to fetch service name: " + catalogError.message);
  }
}

    if (customerId) {
      const customerRes = await axios.get(
        `https://connect.squareup.com/v2/customers/${customerId}`,
        {
          headers: {
            Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      const customer = customerRes.data.customer;
      email = customer?.email_address || null;
      phone = customer?.phone_number || null;
      name = `${customer?.given_name || ""} ${customer?.family_name || ""}`.trim();

      console.log("🙋 Customer Info:", { name, email, phone });
      logToFile("🙋 CUSTOMER:\n" + JSON.stringify({ name, email, phone }, null, 2));
    }

    // 👤 Step 2: Create GHL contact
    if (email || phone) {
      const contactPayload = {
        firstName: name || "Unknown",
        email,
        phone,
        customField: [
          {
            fieldKey: "event_type",
            value: eventType,
          },
        ],
      };

      const ghlRes = await axios.post(
        "https://rest.gohighlevel.com/v1/contacts/",
        contactPayload,
        {
          headers: {
            Authorization: `Bearer ${GHL_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const contactId = ghlRes.data.contact.id;
      console.log("✅ Contact created in GHL:", contactId);
      logToFile("✅ GHL Contact ID: " + contactId);
    } else {
      console.log("⚠️ No email or phone found. Skipping GHL creation.");
      logToFile("⚠️ SKIPPED: Missing email/phone for customer ID: " + customerId);
    }

    res.status(200).send("Webhook processed");
  } catch (error) {
    const errMsg = error.response?.data
      ? JSON.stringify(error.response.data, null, 2)
      : error.message;

    logToFile("❌ ERROR:\n" + errMsg);

    console.error("❌ Webhook error:");
    if (error.response) {
      console.error("🔴 Status:", error.response.status);
      console.error("🔴 Data:", error.response.data);
    } else {
      console.error("💥 Message:", error.message);
    }

    res.status(500).send("Something went wrong");
  }
});

// ✅ Log file download route
app.get('/download-log', (req, res) => {
  const filePath = path.join(__dirname, 'webhook_payloads.log');
  res.download(filePath, 'webhook_payloads.log', (err) => {
    if (err) {
      console.error('❌ Download error:', err);
      res.status(500).send('Could not download file');
    }
  });
});

// ✅ Start server
app.listen(port, () => {
  console.log(`🚀 Server is listening on port ${port}`);
});
