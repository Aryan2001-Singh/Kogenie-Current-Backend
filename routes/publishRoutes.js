const express = require("express");
const axios = require("axios");
const MetaAccount = require("../models/MetaAccounts");

const router = express.Router();

router.post("/instagram", async (req, res) => {
  const { clerkUserId, imageUrl, caption } = req.body;

  if (!clerkUserId || !imageUrl || !caption) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    // 1. Find the user's Meta account
    const account = await MetaAccount.findOne({ clerkUserId });

    if (
      !account ||
      !account.igUserId ||
      !account.fbPageAccessToken
    ) {
      return res.status(404).json({
        message: "Meta account not fully connected or missing Instagram access.",
      });
    }

    const { igUserId, fbPageAccessToken } = account;

    // 2. Step 1 - Create IG media container
    const createMediaRes = await axios.post(
      `https://graph.facebook.com/v19.0/${igUserId}/media`,
      null,
      {
        params: {
          image_url: imageUrl,
          caption,
          access_token: fbPageAccessToken,
        },
      }
    );

    const creationId = createMediaRes.data.id;

    // 3. Step 2 - Publish media container
    const publishMediaRes = await axios.post(
      `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
      null,
      {
        params: {
          creation_id: creationId,
          access_token: fbPageAccessToken,
        },
      }
    );

    const postId = publishMediaRes.data.id;

    return res.status(200).json({
      success: true,
      message: "Ad successfully published to Instagram.",
      postId,
    });
  } catch (err) {
    console.error("❌ Instagram publish error:", err?.response?.data || err.message);
    return res.status(500).json({
      message: "Failed to publish to Instagram",
      error: err?.response?.data || err.message,
    });
  }
});

module.exports = router;