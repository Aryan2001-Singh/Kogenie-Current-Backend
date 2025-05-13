const express = require("express");
const axios = require("axios");
const MetaAccount = require("../models/MetaAccounts");

const router = express.Router();

const REDIRECT_URI =
  process.env.META_DEV_REDIRECT_URI || "https://api.kogenie.com/api/auth/facebook/callback";

// Encode/Decode utility
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

  const oauthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${REDIRECT_URI}&scope=public_profile,email,pages_show_list,pages_manage_posts,instagram_basic,instagram_content_publish&state=${state}`;

  return res.redirect(oauthUrl);
});

// Step 2: Handle callback and store everything
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

  try {
    // Step 1: Exchange code for short-lived token
    const tokenRes = await axios.get("https://graph.facebook.com/v19.0/oauth/access_token", {
      params: {
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri: REDIRECT_URI,
        code,
      },
    });

    const shortLivedToken = tokenRes.data.access_token;
    console.log("✅ Short-lived token received");

    // Step 2: Exchange for long-lived token
    const longTokenRes = await axios.get("https://graph.facebook.com/v19.0/oauth/access_token", {
      params: {
        grant_type: "fb_exchange_token",
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        fb_exchange_token: shortLivedToken,
      },
    });

    const longLivedToken = longTokenRes.data.access_token;
    console.log("✅ Long-lived token received");

    // Step 3: Get Facebook user ID
    const userRes = await axios.get(
      `https://graph.facebook.com/me?fields=id,name,email&access_token=${longLivedToken}`
    );
    const fbUserId = userRes.data.id;

    // Step 4: Get user's Pages
    const pagesRes = await axios.get("https://graph.facebook.com/v19.0/me/accounts", {
      params: { access_token: longLivedToken },
    });

    const pages = pagesRes.data.data;
    if (!pages.length) {
      console.warn("⚠️ User has no connected Facebook Pages");
    }

    const firstPage = pages[0];
    const fbPageId = firstPage?.id;
    const fbPageName = firstPage?.name;
    const fbPageAccessToken = firstPage?.access_token;

    // Step 5: Get Instagram Business Account
    let igUserId = null;
    let igUsername = null;

    if (fbPageId) {
      const pageDetails = await axios.get(
        `https://graph.facebook.com/v19.0/${fbPageId}?fields=connected_instagram_account&access_token=${fbPageAccessToken}`
      );

      igUserId = pageDetails.data?.connected_instagram_account?.id || null;

      if (igUserId) {
        const igDetails = await axios.get(
          `https://graph.facebook.com/v19.0/${igUserId}?fields=username&access_token=${fbPageAccessToken}`
        );
        igUsername = igDetails.data?.username || null;
      }
    }

    // Step 6: Save to DB
    await MetaAccount.findOneAndUpdate(
      { clerkUserId },
      {
        clerkUserId,
        fbUserId,
        fbAccessToken: longLivedToken,
        tokenExpiry: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
        fbPageId,
        fbPageName,
        fbPageAccessToken,
        igUserId,
        igUsername,
      },
      { upsert: true }
    );

    console.log("✅ Meta account stored for user:", clerkUserId);

    // ✅ Step 7: Redirect back to app with fbConnected=success
    const delimiter = returnPath.includes("?") ? "&" : "?";
    const fullRedirect = `https://www.kogenie.com${returnPath}${delimiter}fbConnected=success`;

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