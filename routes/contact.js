const express = require("express");
const router = express.Router();
const connectToDatabase = require("../lib/mongodb");
const Contact = require("../models/Contact");

router.post("/contact", async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    await connectToDatabase();
    const newContact = new Contact({ name, email, message });
    await newContact.save();

    res.status(200).json({ message: "Message received!" });
  } catch (error) {
    console.error("❌ Error saving contact:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;