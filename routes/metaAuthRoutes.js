const express = require("express");
const axios = require("axios");
const MetaAccount = require("../models/MetaAccounts")

const router = express.Router();

// Step 1: Redirect user to Meta OAuth
router.get("/facebook", (req, res) => {
  const { userId } = req.query;

  const redirectUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${process.env.META_REDIRECT_URI}&scope=pages_show_list,instagram_basic,instagram_content_publish,pages_read_engagement,public_profile&state=${userId}`;

  res.redirect(redirectUrl);
});

// Step 2: Callback to receive access_token
router.get("/facebook/callback", async (req, res) => {
  const { code, state: clerkUserId } = req.query;

  try {
    // Exchange code for access_token
    const tokenRes = await axios.get(
      `https://graph.facebook.com/v19.0/oauth/access_token`, {
        params: {
          client_id: process.env.META_APP_ID,
          client_secret: process.env.META_APP_SECRET,
          redirect_uri: process.env.META_REDIRECT_URI,
          code,
        },
      }
    );

    const accessToken = tokenRes.data.access_token;

    // Get user info
    const userRes = await axios.get(
      `https://graph.facebook.com/me?fields=id,name&access_token=${accessToken}`
    );

    const fbUserId = userRes.data.id;

    // Get pages and IG ID
    const pagesRes = await axios.get(
      `https://graph.facebook.com/${fbUserId}/accounts?access_token=${accessToken}`
    );

    const page = pagesRes.data.data?.[0];
    const fbPageId = page?.id;

    const igRes = await axios.get(
      `https://graph.facebook.com/v19.0/${fbPageId}?fields=instagram_business_account&access_token=${accessToken}`
    );

    const igUserId = igRes.data.instagram_business_account?.id;

    // Save to MongoDB
    await MetaAccount.findOneAndUpdate(
      { clerkUserId },
      {
        clerkUserId,
        fbUserId,
        fbAccessToken: accessToken,
        fbPageId,
        igUserId,
        tokenExpiry: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days expiry approx
      },
      { upsert: true }
    );

    res.send("✅ Facebook/Instagram connected! You can close this window.");
  } catch (err) {
    console.error("❌ Meta callback error:", err.message);
    res.status(500).send("Meta login failed.");
  }
});

module.exports = router;