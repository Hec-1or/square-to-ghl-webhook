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

// ✅ GHL API Key
const GHL_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsb2NhdGlvbl9pZCI6IkxDdGJ4MHlxWlY0NXpRcmhaZ3N3IiwidmVyc2lvbiI6MSwiaWF0IjoxNzQzMTE0NjUzOTUyLCJzdWIiOiJzbVN1VWg1UHVZcmtjMkdUcUhjZSJ9.1ug1Yf0YOXvzVE60Wu2lVdqyKGC8dBtHWvZG6kEMwHk";
const SQUARE_ACCESS_TOKEN = "EAAAlxkDRuXNvFfiJUDdqfcKuMv5ovNklo5WLcgw6OhA3GJw0ZTg3kS8sUya0QY-";

// ✅ Middleware to parse JSON
app.use("/square-webhook", express.json());

// ✅ Staff member ID → Name mapping
const staffMap = {
  "tiy6AkXcGwDKIqmTADFP": "Maria de Los Ángeles Ferrer",
  "TMh40UFdwYtEA5IV": "MILAY GONZALEZ",
  "TMz167qfamP3BQAf": "Thalia Jon Estrada",
  "i2o7OaHPSgrVvSIsV4RI": "Yamile Serna"
};

// ✅ Webhook route for Square
app.post("/square-webhook", async (req, res) => {
  console.log("📨 Webhook Received");
  const payload = JSON.stringify(req.body, null, 2);
  logToFile("📦 PAYLOAD:\n" + payload);

  const eventType = req.body?.type || "unknown_event";
  const booking = req.body?.data?.object?.booking;
  const customerId = booking?.customer_id;

  let email = null;
  let phone = null;
  let name = "Unknown";
  let serviceName = "Unknown Service";
  let staffName = "Unknown";

  const serviceVariationId = booking?.appointment_segments?.[0]?.service_variation_id;
  const teamMemberId = booking?.appointment_segments?.[0]?.team_member_id;

  // ✅ Get staff name from hardcoded map
  if (teamMemberId && staffMap[teamMemberId]) {
    staffName = staffMap[teamMemberId];
    console.log("👤 Staff Name:", staffName);
    logToFile("👤 STAFF NAME: " + staffName);
  }

  // ✅ Get service name from Square Catalog
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
      logToFile("⚠️ Catalog Error:\n" + JSON.stringify(catalogError.response?.data || catalogError.message, null, 2));
    }
  }

  // ✅ Lookup customer details
  if (customerId) {
    try {
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
    } catch (err) {
      logToFile("❌ Customer Lookup Error:\n" + JSON.stringify(err.response?.data || err.message, null, 2));
    }
  }

  // ✅ Send to GHL if contact data exists
  if (email || phone) {
    try {
      const ghlRes = await axios.post(
        "https://rest.gohighlevel.com/v1/contacts/",
        {
          firstName: name || "Unknown",
          email,
          phone,
          tags: [eventType, serviceName, staffName],
        },
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
    } catch (err) {
      logToFile("❌ GHL Contact Error:\n" + JSON.stringify(err.response?.data || err.message, null, 2));
    }
  } else {
    console.log("⚠️ No email or phone. Skipping.");
    logToFile("⚠️ SKIPPED: No email/phone for customer ID: " + customerId);
  }

  res.status(200).send("Webhook processed");
});

// ✅ Download log route
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
