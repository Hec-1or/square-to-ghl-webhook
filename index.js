// ✅ Required modules
const fs = require("fs");
const express = require("express");
const axios = require("axios");
const path = require("path");
const querystring = require("querystring");

const app = express();
const port = 3000;

// ✅ Logging helper
function logToFile(content) {
  const logEntry = `\n[${new Date().toISOString()}]\n${content}\n------------------------\n`;
  fs.appendFileSync("webhook_payloads.log", logEntry);
}

// ✅ GHL API key (static for now)
const GHL_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsb2NhdGlvbl9pZCI6IkxDdGJ4MHlxWlY0NXpRcmhaZ3N3IiwidmVyc2lvbiI6MSwiaWF0IjoxNzQzMTE0NjUzOTUyLCJzdWIiOiJzbVN1VWg1UHVZcmtjMkdUcUhjZSJ9.1ug1Yf0YOXvzVE60Wu2lVdqyKGC8dBtHWvZG6kEMwHk"; // Replace this

// ✅ OAuth credentials from Square
const SQUARE_CLIENT_ID = "sq0idp-kEFwtcSD2DW4qjejf52yjA";
const SQUARE_CLIENT_SECRET = "sq0csp-s9VwjrkZS50-Zpi7YhRYq-8iTxKdgMRkdmymfkdQHA4";
const OAUTH_REDIRECT_URI = "https://square-to-ghl-webhook-production.up.railway.app/oauth/callback";

let squareAccessToken = null; // Will be filled in after OAuth

// ✅ Middleware to parse JSON
app.use("/square-webhook", express.json());

// ✅ OAuth Login
app.get("/oauth/login", (req, res) => {
  const scopes = [
    "CUSTOMERS_READ",
    "MERCHANT_PROFILE_READ",
    "PAYMENTS_READ"
  ].join(" "); // ✅ Use space as separator

  const redirectUrl = `https://connect.squareup.com/oauth2/authorize?client_id=${SQUARE_CLIENT_ID}&scope=${encodeURIComponent(scopes)}&session=false&redirect_uri=${OAUTH_REDIRECT_URI}`;

  res.redirect(redirectUrl);
});


  const redirectUrl = `https://connect.squareup.com/oauth2/authorize?client_id=${SQUARE_CLIENT_ID}&scope=${scopes}&session=false&redirect_uri=${OAUTH_REDIRECT_URI}`;

  res.redirect(redirectUrl);

// ✅ OAuth Callback
app.get("/oauth/callback", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("Authorization code missing");
  }

  try {
    const tokenRes = await axios.post(
      "https://connect.squareup.com/oauth2/token",
      {
        client_id: SQUARE_CLIENT_ID,
        client_secret: SQUARE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: OAUTH_REDIRECT_URI,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    squareAccessToken = tokenRes.data.access_token;
    const merchantId = tokenRes.data.merchant_id;

    logToFile(`🟢 OAUTH SUCCESS:\nMerchant: ${merchantId}\nToken: ${squareAccessToken}`);
    console.log("✅ Token received and saved");
    res.send("✅ OAuth Success! Check your logs for the token.");
  } catch (err) {
    logToFile("❌ OAuth Callback Error:\n" + JSON.stringify(err.response?.data || err.message, null, 2));
    console.error("❌ OAuth Error:", err.response?.data || err.message);
    res.status(500).send("❌ OAuth failed. See logs.");
  }
});

// ✅ Webhook listener (basic)
app.post("/square-webhook", async (req, res) => {
  console.log("📨 Webhook received");
  logToFile("📨 Webhook Payload:\n" + JSON.stringify(req.body, null, 2));
  res.status(200).send("Received");
});

// ✅ Download logs
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
