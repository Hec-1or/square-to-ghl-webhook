const fs = require('fs');
const express = require("express");
const axios = require("axios");
const path = require('path');
const querystring = require("querystring");

const app = express();
const port = 3000;

// ✅ Logging helper
function logToFile(content) {
  const logEntry = `\n[${new Date().toISOString()}]\n${content}\n------------------------\n`;
  fs.appendFileSync("webhook_payloads.log", logEntry);
}

// ✅ API Keys
const SQUARE_CLIENT_ID = "sq0idp-YnKPvNSmeGqBnnwAlL9m-g";
const SQUARE_CLIENT_SECRET = "sq0csp-04E1oKh1G7sha7_r1xOXV02zTj1pxmlj52vot1kqDjc";
const REDIRECT_URI = "https://square-to-ghl-webhook-production.up.railway.app/oauth/callback";
const GHL_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."; // ✏️ Shortened for privacy

// ✅ TEMP token (used before OAuth flow is finished)
let SQUARE_ACCESS_TOKEN = "EAAAlzn7ojeRCtAp1T7d-lSeeJa_TcmepPsDEYY5d6D3rOVvoZpz5xSdH8wE8LEv";

// ✅ Middleware
app.use("/square-webhook", express.json());

// ✅ OAuth Login Route
app.get("/oauth/login", (req, res) => {
  const scopes = "CUSTOMERS_READ+ITEMS_READ+TEAM_READ";

  const authUrl = `https://connect.squareup.com/oauth2/authorize?client_id=${SQUARE_CLIENT_ID}&scope=${scopes}&session=false&redirect_uri=${REDIRECT_URI}`;
  res.redirect(authUrl);
});

// ✅ OAuth Callback Route
app.get("/oauth/callback", async (req, res) => {
  const { code } = req.query;

  if (!code) return res.status(400).send("Missing authorization code");

  try {
    const response = await axios.post(
      "https://connect.squareup.com/oauth2/token",
      {
        client_id: SQUARE_CLIENT_ID,
        client_secret: SQUARE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const accessToken = response.data.access_token;
    const merchantId = response.data.merchant_id;

    SQUARE_ACCESS_TOKEN = accessToken; // 🔐 Update active token

    logToFile(`🟢 OAUTH SUCCESS\nMerchant: ${merchantId}\nToken: ${accessToken}`);
    console.log("✅ OAuth successful");

    res.send("✅ Authorization complete. You may now close this tab.");
  } catch (err) {
    const msg = JSON.stringify(err.response?.data || err.message, null, 2);
    logToFile("❌ OAuth Callback Error:\n" + msg);
    res.status(500).send("OAuth failed. Check logs.");
  }
});

// ✅ Webhook Route
app.post("/square-webhook", async (req, res) => {
  const payload = JSON.stringify(req.body, null, 2);
  logToFile("📦 Webhook Payload:\n" + payload);

  const eventType = req.body?.type || "unknown_event";
  const booking = req.body?.data?.object?.booking;
  const customerId = booking?.customer_id;

  try {
    let email = null;
    let phone = null;
    let name = "Unknown";
    let serviceName = "Unknown Service";
    let staffName = "Unknown Staff";

    const serviceVariationId = booking?.appointment_segments?.[0]?.service_variation_id;
    const teamMemberId = booking?.appointment_segments?.[0]?.team_member_id;

    // 🔍 Staff
    if (teamMemberId) {
      try {
        const teamRes = await axios.get(
          `https://connect.squareup.com/v2/team-members/${teamMemberId}`,
          { headers: { Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}` } }
        );
        staffName = teamRes.data?.team_member?.display_name || "Unknown";
        logToFile("👤 STAFF NAME: " + staffName);
      } catch (e) {
        logToFile("⚠️ Staff Lookup Failed:\n" + JSON.stringify(e.response?.data || e.message, null, 2));
      }
    }

    // 🔍 Service Name
    if (serviceVariationId) {
      try {
        const catalogRes = await axios.get(
          `https://connect.squareup.com/v2/catalog/object/${serviceVariationId}`,
          { headers: { Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}` } }
        );
        serviceName = catalogRes.data?.object?.item_variation?.name || "Unknown";
        logToFile("🛍️ SERVICE NAME: " + serviceName);
      } catch (e) {
        logToFile("⚠️ Service Lookup Failed:\n" + JSON.stringify(e.response?.data || e.message, null, 2));
      }
    }

    // 🔍 Customer Info
    if (customerId) {
      const customerRes = await axios.get(
        `https://connect.squareup.com/v2/customers/${customerId}`,
        { headers: { Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}` } }
      );
      const customer = customerRes.data.customer;
      email = customer?.email_address;
      phone = customer?.phone_number;
      name = `${customer?.given_name || ""} ${customer?.family_name || ""}`.trim();
      logToFile("🙋 CUSTOMER:\n" + JSON.stringify({ name, email, phone }, null, 2));
    }

    // 📨 Send to GHL
    if (email || phone) {
      const contactPayload = {
        firstName: name,
        email,
        phone,
        customField: [
          { fieldKey: "event_type", value: eventType },
          { fieldKey: "service_name", value: serviceName },
          { fieldKey: "staff_name", value: staffName },
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

      logToFile("✅ GHL Contact Created: " + ghlRes.data.contact.id);
    } else {
      logToFile("⚠️ Skipped: No email or phone for customer.");
    }

    res.status(200).send("Webhook processed");
  } catch (error) {
    const errMsg = JSON.stringify(error.response?.data || error.message, null, 2);
    logToFile("❌ Webhook Error:\n" + errMsg);
    res.status(500).send("Something went wrong");
  }
});

// ✅ Log file download route
app.get('/download-log', (req, res) => {
  const filePath = path.join(__dirname, 'webhook_payloads.log');
  res.download(filePath, 'webhook_payloads.log', err => {
    if (err) res.status(500).send('Could not download log');
  });
});

// ✅ Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});