import './DesktopSidebar.css';
import { useEffect, useState } from 'react';
import process from 'process';
import Search from '../components/Search';
import TrendingSection from '../components/TrendingsSection'
import SuggestedUsersSection from '../components/SuggestedUsersSection'
import JoinSection from '../components/JoinSection'
import { getAccessToken } from './lib/CheckAuth';

// Sidebar data used to be hardcoded (one fake user, four fake hashtags).
// Now (backlog #19, #20):
//   Trending  = posts with the most likes in the last 7 days (public API)
//   Suggested = 3 random users other than the signed-in one
// Both load only when someone is signed in, as the sections did before.
export default function DesktopSidebar(props) {
  const [trendings, setTrendings] = useState([]);
  const [users, setUsers] = useState([]);
  const signedIn = Boolean(props.user);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;

    const load = async () => {
      const base = process.env.REACT_APP_BACKEND_URL;
      try {
        const res = await fetch(`${base}/api/activities/trending`, { method: 'GET' });
        if (res.ok && !cancelled) {
          setTrendings(await res.json());
        }
      } catch (err) {
        console.log('trending failed', err);
      }
      try {
        const headers = { 'Accept': 'application/json' };
        const accessToken = await getAccessToken();
        if (accessToken) {
          headers['Authorization'] = `Bearer ${accessToken}`;
        }
        const res = await fetch(`${base}/api/users/suggested`, { method: 'GET', headers: headers });
        if (res.ok && !cancelled) {
          setUsers(await res.json());
        }
      } catch (err) {
        console.log('suggested users failed', err);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [signedIn]);

  let trending;
  if (props.user) {
    trending = <TrendingSection trendings={trendings} />
  }

  let suggested;
  if (props.user && users.length > 0) {
    suggested = <SuggestedUsersSection users={users} />
  }
  let join;
  if (props.user) {
  } else {
    join = <JoinSection />
  }

  return (
    <section>
      <Search />
      {trending}
      {suggested}
      {join}
      <footer>
        <a href="#">About</a>
        <a href="#">Terms of Service</a>
        <a href="#">Privacy Policy</a>
      </footer>
    </section>
  );
}
