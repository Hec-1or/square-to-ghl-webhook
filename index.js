const fs = require('fs');
const express = require("express");
const axios = require("axios");
const path = require('path');

const app = express();
const port = 3000;

// ✅ YOUR KEYS (No env variables as requested)
const SQUARE_ACCESS_TOKEN = "EAAAlzn7ojeRCtAp1T7d-lSeeJa_TcmepPsDEYY5d6D3rOVvoZpz5xSdH8wE8LEv";
const GHL_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsb2NhdGlvbl9pZCI6IkxDdGJ4MHlxWlY0NXpRcmhaZ3N3IiwidmVyc2lvbiI6MSwiaWF0IjoxNzQzMTE0NjUzOTUyLCJzdWIiOiJzbVN1VWg1UHVZcmtjMkdUcUhjZSJ9.1ug1Yf0YOXvzVE60Wu2lVdqyKGC8dBtHWvZG6kEMwHk";

// Enable JSON body parsing
app.use("/square-webhook", express.json());

app.post("/square-webhook", async (req, res) => {
  console.log("🧾 Full Payload:", JSON.stringify(req.body, null, 2));

  const eventType = req.body?.type || "unknown_event";
  const booking = req.body?.data?.object?.booking;

  const customerEmail = booking?.buyer_email_address;
  const customerPhone = booking?.buyer_phone_number;
  const name = booking?.buyer_details?.given_name || "Unknown";

  console.log("📅 Event Type:", eventType);
  console.log("📧 Email:", customerEmail);
  console.log("📞 Phone:", customerPhone);

  try {
    if (customerEmail || customerPhone) {
      const contactPayload = {
        firstName: name,
        email: customerEmail,
        phone: customerPhone,
        customField: [
          {
            fieldKey: "event_type",
            value: eventType,
          },
        ],
      };

      const contactRes = await axios.post(
        "https://rest.gohighlevel.com/v1/contacts/",
        contactPayload,
        {
          headers: {
            Authorization: `Bearer ${GHL_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const contactId = contactRes.data.contact.id;
      console.log("📤 Sent to GHL! Contact ID:", contactId);
    } else {
      console.log("⚠️ No email or phone found. Skipping GHL contact creation.");
    }

    res.status(200).send("Webhook processed");
  } catch (error) {
    console.error("❌ Error:", JSON.stringify(error.response?.data || error.message, null, 2));
    res.status(500).send("Something went wrong");
  }
});

// Optional: download your webhook logs (if you log to a file later)
app.get('/download-log', (req, res) => {
  const filePath = path.join(__dirname, 'webhook_payloads.log');
  res.download(filePath, 'webhook_payloads.log', (err) => {
    if (err) {
      console.error('❌ Error sending log file:', err);
      res.status(500).send('Could not download file');
    }
  });
});

// Start server
app.listen(port, () => {
  console.log(`✅ Server is listening on port ${port}`);
});
