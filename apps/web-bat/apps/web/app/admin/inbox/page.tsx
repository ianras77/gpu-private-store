import { apiGet, safeDate } from "@/lib/api";

type Source = {
  id: string;
  title?: string;
  source_url: string;
  fetched_at: string;
};

async function getSources() {
  try {
    return await apiGet<Source[]>("/api/v1/sources");
  } catch {
    return [] as Source[];
  }
}

export default async function AdminInboxPage() {
  const sources = await getSources();

  return (
    <>
      <h1>Inbox</h1>
      <p>Source ingestion feed from SearXNG discovery and fetch pipeline.</p>
      <table className="table">
        <thead>
          <tr>
            <th>Title</th>
            <th>URL</th>
            <th>Fetched</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => (
            <tr key={source.id}>
              <td>{source.title ?? "Untitled"}</td>
              <td>
                <a href={source.source_url} target="_blank" rel="noreferrer">
                  {source.source_url}
                </a>
              </td>
              <td>{safeDate(source.fetched_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
