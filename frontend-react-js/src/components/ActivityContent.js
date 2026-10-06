import './ActivityContent.css';

import { Link } from "react-router-dom";
import { timeAgo, formatTimeExpires } from '../lib/DateTimeFormats';
import {ReactComponent as BombIcon} from './svg/bomb.svg';
import ProfileAvatar from './ProfileAvatar';

// Splits a message into plain text and #hashtags. split() with a capturing
// group keeps the matches at the odd indexes; those become purple spans
// (backlog #41). Built as React elements, never as an HTML string, so a
// message cannot inject markup (XSS).
const HASHTAG_SPLIT = /(#[\p{L}\p{N}_]+)/u;

function renderMessage(message) {
  if (typeof message !== 'string' || message === '') {
    return message;
  }
  return message.split(HASHTAG_SPLIT).map((part, i) =>
    i % 2 === 1
      ? <span className='hashtag' key={i}>{part}</span>
      : part
  );
}

export default function ActivityContent(props) {

  // formatTimeExpires returns null once the post has expired; the countdown
  // is then hidden rather than shown as negative minutes (backlog #25).
  let expires_at;
  const expires_label = props.activity.expires_at
    ? formatTimeExpires(props.activity.expires_at)
    : null;
  if (expires_label) {
    expires_at =  <div className="expires_at" title={props.activity.expires_at}>
                    <BombIcon className='icon' />
                    <span className='ago'>{expires_label}</span>
                  </div>

  }

  return (
    <div className='activity_content_wrap'>
      <div className='activity_avatar'>
  <ProfileAvatar id={props.activity.cognito_user_id} name={props.activity.display_name} />
</div>
      <div className='activity_content'>
        <div className='activity_meta'>
          <Link className='activity_identity' to={`/@`+props.activity.handle}>
            <div className='display_name'>{props.activity.display_name}</div>
            <div className="handle">@{props.activity.handle}</div>
          </Link>{/* activity_identity */}
          <div className='activity_times'>
            <div className="created_at" title={props.activity.created_at}>
              <span className='ago'>{timeAgo(props.activity.created_at)}</span> 
            </div>
            {expires_at}
          </div>{/* activity_times */}
        </div>{/* activity_meta */}
        <div className="message">{renderMessage(props.activity.message)}</div>
      </div>{/* activity_content */}
    </div>
  );
}
