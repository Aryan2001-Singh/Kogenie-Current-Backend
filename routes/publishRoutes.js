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
    const account = await MetaAccount.findOne({ clerkUserId });

    if (!account || !account.fbAccessToken || !account.igUserId) {
      return res.status(404).json({ message: "Meta account not connected" });
    }

    const { fbAccessToken, igUserId } = account;

    // Step 1: Create media container
    const createMedia = await axios.post(
      `https://graph.facebook.com/v19.0/${igUserId}/media`,
      {
        image_url: imageUrl,
        caption: caption,
        access_token: fbAccessToken,
      }
    );

    const creationId = createMedia.data.id;

    // Step 2: Publish the media
    const publishMedia = await axios.post(
      `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
      {
        creation_id: creationId,
        access_token: fbAccessToken,
      }
    );

    res.json({ success: true, postId: publishMedia.data.id });
  } catch (err) {
    console.error("❌ Instagram publish error:", err.message);
    res.status(500).json({ message: "Failed to publish to Instagram" });
  }
});

module.exports = router;