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
    let email = null;
    let phone = null;
    let name = "Unknown";
    let serviceName = "Unknown Service";
    let staffName = "Unknown Staff";

    const serviceVariationId = booking?.appointment_segments?.[0]?.service_variation_id;
    const teamMemberId = booking?.appointment_segments?.[0]?.team_member_id;

    if (teamMemberId) {
      try {
        const teamRes = await axios.get(
          `https://connect.squareup.com/v2/team-members/${teamMemberId}`,
          {
            headers: {
              Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
          }
        );
        staffName = teamRes.data?.team_member?.display_name || "Unknown";
        console.log("👤 Staff Name:", staffName);
        logToFile("👤 STAFF NAME: " + staffName);
      } catch (staffError) {
        logToFile("⚠️ Staff Error:\n" + JSON.stringify(staffError.response?.data || staffError.message, null, 2));
      }
    }

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

    if (email || phone) {
      const tags = [eventType, serviceName, staffName].filter(Boolean).join(',');
      const contactPayload = {
        firstName: name || "Unknown",
        email,
        phone,
        tags: [eventType, serviceName, staffName],
        customField: [
          { fieldKey: "event_type", value: eventType },
          { fieldKey: "service_name", value: serviceName },
          { fieldKey: "staff_name", value: staffName }
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