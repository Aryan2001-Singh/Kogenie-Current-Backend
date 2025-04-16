const express = require("express");
const router = express.Router();
const Ad = require("../models/Ad");
const ScrapedAd = require("../models/ScrapedAd");

// 1️⃣ Total ads per user
router.get("/total-per-user", async (req, res) => {
  try {
    const result = await Ad.aggregate([
      { $group: { _id: "$userEmail", totalAds: { $sum: 1 } } },
    ]);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Error fetching total ads", error });
  }
});

// 2️⃣ Manual vs Scraped count
router.get("/ad-type-breakdown", async (req, res) => {
  try {
    const manualCount = await Ad.countDocuments();
    const scrapedCount = await ScrapedAd.countDocuments();
    res.json({ manual: manualCount, scraped: scrapedCount });
  } catch (error) {
    res.status(500).json({ message: "Error fetching ad breakdown", error });
  }
});

// 3️⃣ Avg feedback rating
router.get("/avg-feedback", async (req, res) => {
  try {
    const manualRatings = await Ad.aggregate([
      { $match: { "feedback.rating": { $exists: true } } },
      { $group: { _id: null, avg: { $avg: "$feedback.rating" } } },
    ]);

    const scrapedRatings = await ScrapedAd.aggregate([
      { $match: { "feedback.rating": { $exists: true } } },
      { $group: { _id: null, avg: { $avg: "$feedback.rating" } } },
    ]);

    res.json({
      manual: manualRatings[0]?.avg || 0,
      scraped: scrapedRatings[0]?.avg || 0,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching feedback avg", error });
  }
});

// 4️⃣ Top 5 by rating + mock CTR trend data
router.get("/top-performing", async (req, res) => {
  try {
    const topManual = await Ad.find({ "feedback.rating": { $exists: true } })
      .sort({ "feedback.rating": -1 })
      .limit(5)
      .lean();

    const topScraped = await ScrapedAd.find({ "feedback.rating": { $exists: true } })
      .sort({ "feedback.rating": -1 })
      .limit(5)
      .lean();

    // 🧪 CTR mock trend data — replace with real data when ready
    const ctrData = [
      { date: "2025-04-10", ctr: 1.4 },
      { date: "2025-04-11", ctr: 2.1 },
      { date: "2025-04-12", ctr: 1.9 },
      { date: "2025-04-13", ctr: 3.5 },
      { date: "2025-04-14", ctr: 2.7 },
      { date: "2025-04-15", ctr: 4.2 },
    ];

    res.json({
      manual: topManual,
      scraped: topScraped,
      ctrData,
    });
  } catch (error) {
    console.error("❌ Error in /top-performing:", error);
    res.status(500).json({ message: "Failed to fetch top ads & CTR data", error });
  }
});

// 5️⃣ 📊 Feedback Rating Distribution (Frontend-ready format)
router.get("/feedback-distribution", async (req, res) => {
  try {
    const manual = await Ad.aggregate([
      { $match: { "feedback.rating": { $exists: true } } },
      {
        $group: {
          _id: "$feedback.rating",
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const scraped = await ScrapedAd.aggregate([
      { $match: { "feedback.rating": { $exists: true } } },
      {
        $group: {
          _id: "$feedback.rating",
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Transform to map: { 1: 5, 2: 10, ... }
    const manualMap = Object.fromEntries(manual.map((m) => [m._id, m.count]));
    const scrapedMap = Object.fromEntries(scraped.map((s) => [s._id, s.count]));

    // Create unified structure: [{ rating: 1, manual: X, scraped: Y }, ...]
    const unified = [];
    for (let rating = 1; rating <= 5; rating++) {
      unified.push({
        rating,
        manual: manualMap[rating] || 0,
        scraped: scrapedMap[rating] || 0,
      });
    }

    res.json(unified);
  } catch (error) {
    console.error("❌ Error in /feedback-distribution:", error);
    res.status(500).json({ message: "Failed to fetch rating distribution", error });
  }
});

module.exports = router;