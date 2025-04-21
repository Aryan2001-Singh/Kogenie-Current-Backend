const express = require("express");
const router = express.Router();
const Ad = require("../models/Ad");
const ScrapedAd = require("../models/ScrapedAd");
const User = require("../models/Users");

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

// 4️⃣ Top 5 ads by rating + CTR trend (mock)
router.get("/top-performing", async (req, res) => {
  try {
    const topManual = await Ad.find({ "feedback.rating": { $exists: true } })
      .sort({ "feedback.rating": -1 })
      .limit(5)
      .lean();

    const topScraped = await ScrapedAd.find({
      "feedback.rating": { $exists: true },
    })
      .sort({ "feedback.rating": -1 })
      .limit(5)
      .lean();

    const ctrData = [
      { date: "2025-04-10", ctr: 1.4 },
      { date: "2025-04-11", ctr: 2.1 },
      { date: "2025-04-12", ctr: 1.9 },
      { date: "2025-04-13", ctr: 3.5 },
      { date: "2025-04-14", ctr: 2.7 },
      { date: "2025-04-15", ctr: 4.2 },
    ];

    res.json({ manual: topManual, scraped: topScraped, ctrData });
  } catch (error) {
    res.status(500).json({ message: "Error fetching top ads", error });
  }
});

// 5️⃣ Feedback rating distribution
router.get("/feedback-distribution", async (req, res) => {
  try {
    const manual = await Ad.aggregate([
      { $match: { "feedback.rating": { $exists: true } } },
      { $group: { _id: "$feedback.rating", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    const scraped = await ScrapedAd.aggregate([
      { $match: { "feedback.rating": { $exists: true } } },
      { $group: { _id: "$feedback.rating", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    const manualMap = Object.fromEntries(manual.map((m) => [m._id, m.count]));
    const scrapedMap = Object.fromEntries(scraped.map((s) => [s._id, s.count]));

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
    res.status(500).json({ message: "Error fetching distribution", error });
  }
});

// 6️⃣ 📈 Monthly user growth
router.get("/monthly-user-growth", async (req, res) => {
  try {
    const result = await User.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Error fetching user growth", error });
  }
});

// 7️⃣ 📊 Monthly ad creation trend
router.get("/monthly-ad-growth", async (req, res) => {
  try {
    const manual = await Ad.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          totalAds: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const scraped = await ScrapedAd.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          totalAds: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({ manual, scraped });
  } catch (error) {
    res.status(500).json({ message: "Error fetching ad growth", error });
  }
});

router.get("/user-growth-monthly", async (req, res) => {
  try {
    const monthlyUsers = await User.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    res.json(monthlyUsers);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user growth" });
  }
});

router.get("/ad-growth-monthly", async (req, res) => {
  try {
    const manualAds = await Ad.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ]);
    const scrapedAds = await ScrapedAd.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ]);

    const combined = [...manualAds, ...scrapedAds].reduce((acc, curr) => {
      acc[curr._id] = (acc[curr._id] || 0) + curr.count;
      return acc;
    }, {});

    const formatted = Object.entries(combined)
      .map(([month, count]) => ({
        month,
        totalAds: count,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch ad growth" });
  }
});

module.exports = router;
