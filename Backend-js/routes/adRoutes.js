const express = require("express");
const Ad = require("../models/Ad");

const router = express.Router();

// ✅ Route: Store Ad Data (No Response to Frontend)
router.post("/store", async (req, res) => {
  try {
    const { brandName, productName, productDescription, targetAudience, uniqueSellingPoints, adCopy, userEmail } = req.body;

    if (!brandName || !productName || !productDescription || !targetAudience || !uniqueSellingPoints || !adCopy || !userEmail) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const newAd = new Ad({
      brandName,
      productName,
      productDescription,
      targetAudience,
      uniqueSellingPoints,
      adCopy,
      userEmail, 
    });

    await newAd.save();
    res.status(201).json({ message: "✅ Ad stored successfully" });
  } catch (error) {
    console.error("❌ Error saving ad:", error);
    res.status(500).json({ message: "Error saving ad", error: error.message });
  }
});

module.exports = router;

