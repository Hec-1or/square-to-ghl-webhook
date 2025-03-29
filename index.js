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

// ✅ Your API keys
const SQUARE_ACCESS_TOKEN = "EAAAlzn7ojeRCtAp1T7d-lSeeJa_TcmepPsDEYY5d6D3rOVvoZpz5xSdH8wE8LEv";
const GHL_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsb2NhdGlvbl9pZCI6IkxDdGJ4MHlxWlY0NXpRcmhaZ3N3IiwidmVyc2lvbiI6MSwiaWF0IjoxNzQzMTE0NjUzOTUyLCJzdWIiOiJzbVN1VWg1UHVZcmtjMkdUcUhjZSJ9.1ug1Yf0YOXvzVE60Wu2lVdqyKGC8dBtHWvZG6kEMwHk";

// ✅ Middleware
app.use("/square-webhook", express.json());

// ✅ OAUTH ROUTES
app.get("/oauth/login", (req, res) => {
  const scopes = "CUSTOMERS_READ+ITEMS_READ+TEAM_READ";
  const redirectUrl = `https://connect.squareup.com/oauth2/authorize?client_id=sq0idp-YnKPvNSmeGqBnnwAlL9m-g&scope=${scopes}&session=false&redirect_uri=https://square-to-ghl-webhook-production.up.railway.app/oauth/callback`;
  res.redirect(redirectUrl);
});

app.get("/oauth/callback", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("Authorization code missing");
  }

  try {
    const response = await axios.post(
      "https://connect.squareup.com/oauth2/token",
      {
        client_id: "sq0idp-YnKPvNSmeGqBnnwAlL9m-g",
        client_secret: "sq0csp-04E1oKh1G7sha7_r1xOXV02zTj1pxmlj52vot1kqDjc",
        code: code,
        grant_type: "authorization_code",
        redirect_uri: "https://square-to-ghl-webhook-production.up.railway.app/oauth/callback", // ✅ REQUIRED
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const accessToken = response.data.access_token;
    const merchantId = response.data.merchant_id;

    logToFile(`🟢 OAUTH SUCCESS:\nMerchant: ${merchantId}\nToken: ${accessToken}`);
    res.send("✅ Authorized! Check your logs for the token.");
  } catch (err) {
    console.error("❌ OAuth Error:", err.response?.data || err.message);
    logToFile("❌ OAuth Callback Error:\n" + JSON.stringify(err.response?.data || err.message, null, 2));
    res.status(500).send("OAuth failed. Check logs.");
  }
});

// ✅ Webhook Route
app.post("/square-webhook", async (req, res) => {
  console.log("🧾 Payload received:");
  const payload = JSON.stringify(req.body, null, 2);
  logToFile("📦 PAYLOAD:\n" + payload);

  const eventType = req.body?.type || "unknown_event";
  const booking = req.body?.data?.object?.booking;
  const customerId = booking?.customer_id;

  console.log("📅 Event:", eventType);
  console.log("🆔 Customer ID:", customerId);

  // 🔐 Check token permission
  try {
    const test = await axios.get('https://connect.squareup.com/v2/team-members/me', {
      headers: {
        Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('✅ TEAM ACCESS TEST PASSED:', test.data);
    logToFile('✅ TEAM ACCESS TEST PASSED:\n' + JSON.stringify(test.data, null, 2));
  } catch (err) {
    logToFile('❌ TEAM ACCESS TEST FAILED:\n' + JSON.stringify(err.response?.data || err.message, null, 2));
  }

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
      logToFile("🙋 CUSTOMER:\n" + JSON.stringify({ name, email, phone }, null, 2));
    }

    if (email || phone) {
      const contactPayload = {
        firstName: name,
        email,
        phone,
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
      logToFile("⚠️ SKIPPED: Missing email/phone for customer ID: " + customerId);
    }

    res.status(200).send("Webhook processed");
  } catch (error) {
    const errMsg = error.response?.data
      ? JSON.stringify(error.response.data, null, 2)
      : error.message;

    logToFile("❌ ERROR:\n" + errMsg);
    res.status(500).send("Something went wrong");
  }
});

// ✅ Log download route
app.get('/download-log', (req, res) => {
  const filePath = path.join(__dirname, 'webhook_payloads.log');
  res.download(filePath, 'webhook_payloads.log', (err) => {
    if (err) {
      console.error('❌ Download error:', err);
      res.status(500).send('Could not download file');
    }
  });
});

app.listen(port, () => {
  console.log(`🚀 Server is listening on port ${port}`);
});