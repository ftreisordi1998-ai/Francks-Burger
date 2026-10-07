import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://francksburger.com.br",
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: "https://francksburger.com.br/links",
      changeFrequency: "weekly",
      priority: 0.5,
    },
  ];
}
