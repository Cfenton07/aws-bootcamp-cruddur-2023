import './ActivityActionLike.css';
import { useEffect, useState } from 'react';
import process from 'process';
import {ReactComponent as HeartIcon} from './svg/heart.svg';
import {ReactComponent as HeartFilledIcon} from './svg/heart-filled.svg';
import { getAccessToken } from './lib/CheckAuth';

// Like / unlike toggle (backlog #18). Outline heart when not liked, solid
// theme-purple heart when liked (heart-filled.svg is heart.svg's outer
// outline without the cut-out). The server is the source of truth: the
// heart and the count change only after the API answers, so a failed request
// never leaves the UI showing something the database does not have.
export default function ActivityActionLike(props) {
  const [liked, setLiked] = useState(Boolean(props.liked));
  const [count, setCount] = useState(props.count || 0);
  const [busy, setBusy] = useState(false);

  // useState reads props only on first render. When the parent hands down
  // newer data for the same post (a feed reload, a profile change, "View N
  // more replies"), follow it so the heart never shows stale state.
  useEffect(() => {
    setLiked(Boolean(props.liked));
  }, [props.liked]);
  useEffect(() => {
    setCount(props.count || 0);
  }, [props.count]);

  const onclick = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;

    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.log('like: not signed in');
      return;
    }

    setBusy(true);
    try {
      const action = liked ? 'unlike' : 'like';
      const backend_url = `${process.env.REACT_APP_BACKEND_URL}/api/activities/${props.activity_uuid}/${action}`;
      const res = await fetch(backend_url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });
      if (!res.ok) {
        console.log('like failed', res.status);
        return;
      }
      const data = await res.json();
      setLiked(Boolean(data.liked));
      setCount(data.likes_count);
    } catch (err) {
      console.log('like failed', err);
    } finally {
      setBusy(false);
    }
  };

  let counter;
  if (count > 0) {
    counter = <div className="counter">{count}</div>;
  }

  // Three looks: no likes = white outline; liked by others but not me =
  // light-purple outline, a touch bolder; liked by me = solid theme purple.
  const classes = ['action', 'activity_action_heart'];
  if (liked) {
    classes.push('liked');
  } else if (count > 0) {
    classes.push('liked_by_others');
  }

  return (
    <div onClick={onclick} className={classes.join(' ')} role="button" aria-pressed={liked} aria-label={liked ? 'Unlike' : 'Like'}>
      {liked ? <HeartFilledIcon className='icon' /> : <HeartIcon className='icon' />}
      {counter}
    </div>
  );
}
