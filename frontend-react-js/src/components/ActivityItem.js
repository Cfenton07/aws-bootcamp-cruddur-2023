import './ActivityItem.css';
import { useState } from 'react';

import ActivityContent  from '../components/ActivityContent';
import ActivityActionReply  from '../components/ActivityActionReply';
import ActivityActionRepost  from '../components/ActivityActionRepost';
import ActivityActionLike  from '../components/ActivityActionLike';
import ActivityActionShare  from '../components/ActivityActionShare';

export default function ActivityItem(props) {
  // Single-level threading. A child is an ActivityItem rendered by another
  // ActivityItem, which passes the thread root down as rootActivity.
  // Replying to a child targets the root, so a reply never gets replies.
  const isReply = Boolean(props.rootActivity);
  const replyTarget = props.rootActivity ?? props.activity;

  // The home feed sends at most 3 replies per root. When the root's count
  // is higher, the toggle fetches the full list in place from /replies.
  const [allReplies, setAllReplies] = useState(null);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [repliesError, setRepliesError] = useState(null);

  const feedReplies = props.activity.replies || [];
  const hiddenCount = (props.activity.replies_count || 0) - feedReplies.length;
  const shownReplies = allReplies ?? feedReplies;

  const loadAllReplies = async () => {
    setLoadingReplies(true);
    setRepliesError(null);
    try {
      const backend_url = `${process.env.REACT_APP_BACKEND_URL}/api/activities/${props.activity.uuid}/replies`;
      const res = await fetch(backend_url, { method: "GET" });
      if (res.status !== 200) {
        throw new Error(`HTTP ${res.status}`);
      }
      const resJson = await res.json();
      setAllReplies(resJson);
    } catch (err) {
      console.log('load replies failed', err);
      setRepliesError('Could not load replies. Please try again.');
    } finally {
      setLoadingReplies(false);
    }
  };

  let replies;
  if (shownReplies.length > 0) {
    replies = <div className="replies">
                {shownReplies.map(reply => {
                return  <ActivityItem 
                  rootActivity={replyTarget}
                  setReplyActivity={props.setReplyActivity} 
                  setPopped={props.setPopped} 
                  key={reply.uuid} 
                  activity={reply} 
                  />
                })}
              </div>
  }

  let repliesToggle;
  if (!isReply && allReplies === null && hiddenCount > 0) {
    repliesToggle = <button type="button" className="replies_toggle" onClick={loadAllReplies} disabled={loadingReplies}>
                      {loadingReplies ? 'Loading replies...' : `View ${hiddenCount} more ${hiddenCount === 1 ? 'reply' : 'replies'}`}
                    </button>
  } else if (!isReply && allReplies !== null && allReplies.length > feedReplies.length) {
    repliesToggle = <button type="button" className="replies_toggle" onClick={() => setAllReplies(null)}>
                      Show fewer replies
                    </button>
  }

  return (
    <div className={isReply ? 'activity_item reply' : 'activity_item'}>
      <ActivityContent activity={props.activity} />
      <div className="activity_actions">
        <ActivityActionReply setReplyActivity={props.setReplyActivity} activity={replyTarget} setPopped={props.setPopped} activity_uuid={replyTarget.uuid} count={props.activity.replies_count}/>
        {!isReply && <ActivityActionRepost activity_uuid={props.activity.uuid} count={props.activity.reposts_count}/>}
        <ActivityActionLike activity_uuid={props.activity.uuid} count={props.activity.likes_count}/>
        {!isReply && <ActivityActionShare activity_uuid={props.activity.uuid} />}
      </div>
      {replies}
      {repliesToggle}
      {repliesError && <div className="replies_error">{repliesError}</div>}
    </div>
  );
}
