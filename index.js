// ✅ Required modules
const fs = require("fs");
const express = require("express");
const axios = require("axios");
const path = require("path");

const app = express();
const port = 3000;

// ✅ GHL API Key
const GHL_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsb2NhdGlvbl9pZCI6IkxDdGJ4MHlxWlY0NXpRcmhaZ3N3IiwidmVyc2lvbiI6MSwiaWF0IjoxNzQzMTE0NjUzOTUyLCJzdWIiOiJzbVN1VWg1UHVZcmtjMkdUcUhjZSJ9.1ug1Yf0YOXvzVE60Wu2lVdqyKGC8dBtHWvZG6kEMwHk";

// ✅ Square Access Token (static)
const SQUARE_ACCESS_TOKEN = "EAAAlxkDRuXNvFfiJUDdqfcKuMv5ovNklo5WLcgw6OhA3GJw0ZTg3kS8sUya0QY-";

// ✅ Logging Helper
function logToFile(content) {
  const logEntry = `\n[${new Date().toISOString()}]\n${content}\n------------------------\n`;
  fs.appendFileSync("webhook_payloads.log", logEntry);
}

// ✅ Middleware to parse JSON
app.use("/square-webhook", express.json());

// ✅ Webhook route
app.post("/square-webhook", async (req, res) => {
  const payload = req.body;
  logToFile("📩 Webhook Payload:\n" + JSON.stringify(payload, null, 2));

  const booking = payload?.data?.object?.booking;
  const customerId = booking?.customer_id;
  const appointmentTime = booking?.start_at;
  const eventType = payload?.type;
  const serviceVariationId = booking?.appointment_segments?.[0]?.service_variation_id;
  const teamMemberId = booking?.appointment_segments?.[0]?.team_member_id;

  let email = null;
  let phone = null;
  let name = "Unknown";
  let serviceName = "Unknown Service";
  let staffName = "Unknown Staff";

  // ✅ Get Customer Info
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
  } catch (err) {
    logToFile("❌ Customer Fetch Error:\n" + JSON.stringify(err.response?.data || err.message, null, 2));
  }

  // ✅ Get Service Name
  try {
    if (serviceVariationId) {
      const serviceRes = await axios.get(
        `https://connect.squareup.com/v2/catalog/object/${serviceVariationId}`,
        {
          headers: {
            Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      serviceName = serviceRes.data?.object?.item_variation?.name || "Unknown";
    }
  } catch (err) {
    logToFile("⚠️ Service Name Error:\n" + JSON.stringify(err.response?.data || err.message, null, 2));
  }

  // ✅ Get Staff Name
  try {
    if (teamMemberId) {
      const staffRes = await axios.get(
        `https://connect.squareup.com/v2/team-members/${teamMemberId}`,
        {
          headers: {
            Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      staffName = staffRes.data?.team_member?.display_name || "Unknown";
    }
  } catch (err) {
    logToFile("⚠️ Staff Name Error:\n" + JSON.stringify(err.response?.data || err.message, null, 2));
  }

  // ✅ Send to GHL if contact has phone/email
  if (email || phone) {
    try {
      const contactPayload = {
        firstName: name,
        email,
        phone,
        tags: [eventType, serviceName, staffName],
        customField: [
          {
            fieldKey: "time_and_timezone",
            value: appointmentTime, // ISO Format by default
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

      logToFile(`✅ GHL Contact Created: ${ghlRes.data.contact.id}`);
    } catch (err) {
      logToFile("❌ GHL Contact Creation Error:\n" + JSON.stringify(err.response?.data || err.message, null, 2));
    }
  } else {
    logToFile("⚠️ No email or phone to create GHL contact");
  }

  res.status(200).send("✅ Webhook received");
});

// ✅ Log download route
app.get("/download-log", (req, res) => {
  const filePath = path.join(__dirname, "webhook_payloads.log");
  res.download(filePath, "webhook_payloads.log", (err) => {
    if (err) {
      res.status(500).send("Failed to download log file");
    }
  });
});

// ✅ Start server
app.listen(port, () => {
  console.log(`🚀 Server is listening on port ${port}`);
});
