import './ActivityItem.css';

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

  let replies;
  if (props.activity.replies) {
    replies = <div className="replies">
                {props.activity.replies.map(reply => {
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
    </div>
  );
}
