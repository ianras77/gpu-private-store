export type Post = {
  id: number;
  author_type: string;
  display_name?: string | null;
  body: string;
  body_original?: string | null;
  status: string;
  created_at: string;
  published_at?: string | null;
  tags?: string[] | null;
};
