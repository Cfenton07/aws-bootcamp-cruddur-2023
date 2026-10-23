import './MessageItem.css';
import { Link } from "react-router-dom";
import { timeAgo } from '../lib/DateTimeFormats';
import ProfileAvatar from './ProfileAvatar';
import { renderEmoji } from '../lib/emoji';

export default function MessageItem(props) {

  return (
    <Link className='message_item' to={`/@`+props.message.handle}>
      <div className='message_avatar'>
        <ProfileAvatar id={props.message.cognito_user_id} name={props.message.display_name} />
      </div>
      <div className='message_content'>
        <div className='message_meta'>
          <div className='message_identity'>
            <div className='display_name'>{props.message.display_name}</div>
            <div className="handle">@{props.message.handle}</div>
          </div>{/* activity_identity */}
        </div>{/* message_meta */}
        <div className="message">{renderEmoji(props.message.message, 'm')}</div>
        <div className="created_at" title={props.message.created_at}>
          <span className='ago'>{timeAgo(props.message.created_at)}</span> 
        </div>{/* created_at */}
      </div>{/* message_content */}
    </Link>
  );
}
