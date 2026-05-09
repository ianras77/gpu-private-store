import { render, screen } from '@testing-library/react';
import FeedClient from './FeedClient';
import type { Post } from './types';

const posts: Post[] = [
  {
    id: 1,
    body: 'First note',
    display_name: 'Alex',
    tags: ['craving'],
    author_type: 'user',
    status: 'published',
    created_at: new Date().toISOString(),
    published_at: new Date().toISOString()
  }
];

describe('FeedClient', () => {
  it('renders posts and tag', () => {
    render(<FeedClient initialPosts={posts} />);
    expect(screen.getByText(/First note/)).toBeInTheDocument();
    expect(screen.getByText(/Alex/)).toBeInTheDocument();
    expect(screen.getByText(/craving/)).toBeInTheDocument();
  });
});
