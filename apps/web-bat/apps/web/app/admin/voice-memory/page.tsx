import { apiGet, safeDate } from "@/lib/api";

type Memory = {
  id: string;
  memory_type: string;
  key: string;
  value: string;
  weight: number;
  updated_at: string;
};

async function getVoiceMemory() {
  try {
    return await apiGet<Memory[]>("/api/v1/voice-memory");
  } catch {
    return [] as Memory[];
  }
}

export default async function AdminVoiceMemoryPage() {
  const entries = await getVoiceMemory();

  return (
    <>
      <h1>Voice Memory</h1>
      <p>Stored recurring motifs, phrasing wins, stale lines, and tone control notes.</p>
      <table className="table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Key</th>
            <th>Value</th>
            <th>Weight</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>{entry.memory_type}</td>
              <td>{entry.key}</td>
              <td>{entry.value}</td>
              <td>{entry.weight}</td>
              <td>{safeDate(entry.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
