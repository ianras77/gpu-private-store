import Link from "next/link";

import { apiGet } from "@/lib/api";

type Theme = {
  id: string;
  slug: string;
  name: string;
  active_score: number;
  description?: string;
};

async function getThemes() {
  try {
    return await apiGet<Theme[]>("/api/v1/themes");
  } catch {
    return [] as Theme[];
  }
}

export default async function AdminThemesPage() {
  const themes = await getThemes();

  return (
    <>
      <h1>Themes</h1>
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Slug</th>
            <th>Active Score</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {themes.map((theme) => (
            <tr key={theme.id}>
              <td>
                <Link href={`/themes/${theme.slug}`}>{theme.name}</Link>
              </td>
              <td>{theme.slug}</td>
              <td>{theme.active_score.toFixed(2)}</td>
              <td>{theme.description ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
