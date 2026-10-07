import './ActivityFeed.css';
import ActivityItem from './ActivityItem';

// props.banner ('home' | 'notifications') adds a page banner and makes the
// heading sticky (banner CSS in ActivityFeed.css). Without it the heading is
// unchanged, so the Profile page (no title, no banner) looks the same as before.
// props.children (e.g. the Home compose form) renders BELOW the heading, so an
// open form no longer pushes the sticky banner down (backlog #45).
export default function ActivityFeed(props) {
  const headingClass = props.banner
    ? `activity_feed_heading banner banner_${props.banner}`
    : 'activity_feed_heading';
  return (
    <div className='activity_feed'>
      <div className={headingClass}>
        <div className='title'>{props.title}</div>
      </div>
      {props.children}
      <div className='activity_feed_collection'>
        {props.activities.map(activity => {
        return  <ActivityItem setReplyActivity={props.setReplyActivity} setPopped={props.setPopped} key={activity.uuid} activity={activity} />
        })}
      </div>
    </div>
  );
}
