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
      let ad = await Ad.findById(id);
      if (!ad) {
        ad = await ScrapedAd.findById(id); // check fallback model
      }

      if (!ad) return res.status(404).json({ error: "Ad not found" });

      res.status(200).json(ad);
    } catch (error) {
      res.status(500).json({ error: "Server error" });
    }
  } else {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${method} Not Allowed`);
  }
}