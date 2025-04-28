const express = require("express");
const axios = require("axios");
const MetaAccount = require("../models/MetaAccounts");

const router = express.Router();

// ✅ Use correct redirect URI from .env
const REDIRECT_URI =
  process.env.META_DEV_REDIRECT_URI || "https://api.kogenie.com/api/auth/facebook/callback";

// 🧠 Utility to encode & decode state
const encodeState = (data) => Buffer.from(JSON.stringify(data)).toString("base64");
const decodeState = (str) => JSON.parse(Buffer.from(str, "base64").toString("utf8"));

// Step 1: Redirect user to Meta OAuth
router.get("/facebook", (req, res) => {
  const { userId, orgId, returnPath } = req.query;

  if (!userId || !orgId || !returnPath) {
    console.error("❌ Missing userId, orgId, or returnPath in query:", req.query);
    return res.status(400).send("Missing userId, orgId or returnPath");
  }

  const state = encodeState({ userId, orgId, returnPath });

  console.log("👉 Step 1 - redirect_uri sent to Facebook:", REDIRECT_URI);
  console.log("👉 Step 1 - encoded state:", state);

  const oauthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${REDIRECT_URI}&scope=public_profile,email&state=${state}`;

  return res.redirect(oauthUrl);
});

// Step 2: Callback to receive access_token
router.get("/facebook/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    console.error("❌ Missing 'code' or 'state' in callback query:", req.query);
    return res.status(400).send("Missing required parameters in callback");
  }

  let decodedState;
  try {
    decodedState = decodeState(state);
  } catch (err) {
    console.error("❌ Failed to decode state param:", err);
    return res.status(400).send("Invalid state format");
  }

  const { userId: clerkUserId, orgId, returnPath } = decodedState;

  console.log("👉 Step 2 - Code received:", code);
  console.log("👉 Step 2 - Clerk User ID:", clerkUserId);
  console.log("👉 Step 2 - Org ID:", orgId);
  console.log("👉 Step 2 - returnPath:", returnPath);
  console.log("👉 Step 2 - redirect_uri used in token exchange:", REDIRECT_URI);

  try {
    // Exchange code for access_token
    const tokenRes = await axios.get("https://graph.facebook.com/v19.0/oauth/access_token", {
      params: {
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri: REDIRECT_URI,
        code,
      },
    });

    const accessToken = tokenRes.data.access_token;
    console.log("✅ Access Token received:", accessToken);

    // Get user info from Facebook
    const userRes = await axios.get(
      `https://graph.facebook.com/me?fields=id,name,email&access_token=${accessToken}`
    );

    const fbUserId = userRes.data.id;
    console.log("✅ Facebook User ID:", fbUserId);

    // Save to MongoDB
    await MetaAccount.findOneAndUpdate(
      { clerkUserId },
      {
        clerkUserId,
        fbUserId,
        fbAccessToken: accessToken,
        tokenExpiry: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // ~60 days
      },
      { upsert: true }
    );

    console.log("✅ Meta account stored for user:", clerkUserId);

    // ✅ Redirect back to the returnPath page with success status
    const fullRedirect = `https://www.kogenie.com${returnPath}?fbConnected=success`;
    return res.redirect(fullRedirect);
  } catch (err) {
    console.error("❌ Meta callback error:");
    console.error("  ➤ Message:", err.message);
    console.error("  ➤ Status:", err.response?.status);
    console.error("  ➤ Response Data:", err.response?.data);

    return res.redirect("https://www.kogenie.com?fbConnected=fail");
  }
});

module.exports = router;