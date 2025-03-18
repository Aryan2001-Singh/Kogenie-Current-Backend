const mongoose = require("mongoose");
const logger = require("../utils/logger");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10, // ✅ Correct way to set maxPoolSize in Mongoose 7+
      serverSelectionTimeoutMS: 5000, // ✅ Prevent long waits for DB connection issues
      socketTimeoutMS: 45000, // ✅ Close inactive sockets after 45s
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    logger.info("✅ MongoDB Connected Successfully");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    process.exit(1); // Stop the app if DB connection fails
  }
};

module.exports = connectDB;