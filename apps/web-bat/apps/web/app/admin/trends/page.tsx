import { apiGet } from "@/lib/api";

type Trend = {
  id: string;
  observation_date: string;
  title?: string;
  summary?: string;
  change_type?: string;
  confidence: number;
};

async function getTrends() {
  try {
    return await apiGet<Trend[]>("/api/v1/trends");
  } catch {
    return [] as Trend[];
  }
}

export default async function AdminTrendsPage() {
  const trends = await getTrends();

  return (
    <>
      <h1>Trends</h1>
      <p>Daily trend observations used for pattern-aware political analysis.</p>
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Title</th>
            <th>Change</th>
            <th>Confidence</th>
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>
          {trends.map((trend) => (
            <tr key={trend.id}>
              <td>{trend.observation_date}</td>
              <td>{trend.title ?? "-"}</td>
              <td>{trend.change_type ?? "-"}</td>
              <td>{trend.confidence.toFixed(2)}</td>
              <td>{trend.summary ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
