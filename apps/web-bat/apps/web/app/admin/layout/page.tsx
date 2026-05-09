import { apiGet, safeDate } from "@/lib/api";

type Snapshot = {
  id: string;
  status: string;
  rationale?: string;
  created_at: string;
};

async function getSnapshots() {
  try {
    return await apiGet<Snapshot[]>("/api/v1/homepage/snapshots");
  } catch {
    return [] as Snapshot[];
  }
}

export default async function AdminLayoutPage() {
  const rows = await getSnapshots();

  return (
    <>
      <h1>Layout Drafts</h1>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Status</th>
            <th>Created</th>
            <th>Rationale</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.id.slice(0, 8)}...</td>
              <td>{row.status}</td>
              <td>{safeDate(row.created_at)}</td>
              <td>{row.rationale ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
