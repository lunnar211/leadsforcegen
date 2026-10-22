export type Lead = {
  company: string;
  industry: string;
  location: string;
  size: string;
  website: string;
  description: string;
  score: number; // AI fit score 0-100
};

export type Plan = "free" | "pro";

export const FREE_DAILY_LEAD_LIMIT = 30;
export const PRO_DAILY_LEAD_LIMIT = 2000;

export function sampleLeads(input: {
  industry?: string;
  location?: string;
  size?: string;
}): Lead[] {
  const industry = input.industry || "SaaS";
  const location = input.location || "United States";
  const size = input.size || "11-50";
  const names = [
    "Northwind Studio",
    "BrightPath Labs",
    "Summit Works",
    "Clearline Group",
    "Harbor & Co",
    "Vertex Partners",
    "Bluepeak Systems",
    "Atlas Ventures Co",
    "NovaGrid",
    "Pioneer Collective",
  ];
  return names.map((company, i) => ({
    company: `${company} (${industry})`,
    industry,
    location,
    size,
    website: "example.com",
    description: `Sample company-level prospect in ${industry} based in ${location}. Verify details before outreach.`,
    score: 92 - i * 3,
  }));
}
