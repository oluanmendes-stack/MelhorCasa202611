import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { handleScrape } from "./routes/scrape";
import { handleScrapeStream } from "./routes/scrapeStream";
import { handleLeilao } from "./routes/leilao";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    res.json({ message: "Hello from Express server v2!" });
  });

  app.get("/api/demo", handleDemo);

  // Python scraping routes
  app.post("/api/scrape", handleScrape);
  app.post("/api/scrape-stream", handleScrapeStream);
  app.post("/api/leilao", handleLeilao);

  return app;
}
