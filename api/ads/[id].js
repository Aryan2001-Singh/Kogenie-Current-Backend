import dbConnect from "@/lib/dbConnect";
import Ad from "@/models/Ad";
import ScrapedAd from "@/models/ScrapedAd";

export default async function handler(req, res) {
  await dbConnect();

  const {
    query: { id },
    method,
  } = req;

  if (method === "GET") {
    try {
      // Try fetching from the manual ad collection
      let ad = await Ad.findById(id);

      // Fallback to scraped collection if not found
      if (!ad) {
        ad = await ScrapedAd.findById(id);
      }

      // If still not found, return 404
      if (!ad) {
        return res.status(404).json({ error: "Ad not found" });
      }

      // Return the found ad
      return res.status(200).json(ad);
    } catch (error) {
      console.error("❌ Error in /api/ads/[id]:", error);
      return res.status(500).json({ error: "Server error" });
    }
  } else {
    // Handle other unsupported methods
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${method} Not Allowed`);
  }
}