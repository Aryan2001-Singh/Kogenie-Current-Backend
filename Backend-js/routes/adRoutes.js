const express = require("express");
const Ad = require("../models/Ad");
const router = express.Router();
const NodeCache = require("node-cache"); // ✅ Import NodeCache for in-memory caching
const cache = new NodeCache({ stdTTL: 300, checkperiod: 320 }); // Cache expires in 5 minutes
const compression = require("compression"); // ✅ Enable response compression
const mongoose = require("mongoose");

// ✅ Apply Compression Middleware
router.use(compression());

// ✅ Route: Store Ad Data
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
    
    // ✅ Clear cache when a new ad is added
    cache.del("ads");
    
    res.status(201).json({ message: "✅ Ad stored successfully" });
  } catch (error) {
    console.error("❌ Error saving ad:", error);
    res.status(500).json({ message: "Error saving ad", error: error.message });
  }
});

// ✅ Route: Fetch Ads with Caching & Indexing
router.get("/fetch", async (req, res) => {
  try {
    // ✅ Check if ads are already cached
    const cachedAds = cache.get("ads");
    if (cachedAds) {
      return res.status(200).json({ fromCache: true, ads: cachedAds });
    }

    // ✅ Use Indexes to Speed Up Queries
    const ads = await Ad.find().sort({ createdAt: -1 }).lean();
    
    // ✅ Store ads in cache before sending response
    cache.set("ads", ads);
    
    res.status(200).json({ fromCache: false, ads });
  } catch (error) {
    console.error("❌ Error fetching ads:", error);
    res.status(500).json({ message: "Error fetching ads", error: error.message });
  }
});

module.exports = router;

