import './TrendItem.css';
import { Link } from 'react-router-dom';

// One "most liked this week" entry. There is no single-post page yet, so the
// entry links to the author's profile.
export default function TrendItem(props) {
  const trending = props.trending;
  const likes = trending.week_likes;

  return (
    <Link className="trending" to={'/@' + trending.handle}>
      <span className="message">{trending.message}</span>
      <span className="count">{trending.display_name} · {likes} {likes === 1 ? 'like' : 'likes'} this week</span>
    </Link>
  );
}
