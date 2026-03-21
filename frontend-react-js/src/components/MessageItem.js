import './MessageItem.css';
import { Link } from "react-router-dom";
import { timeAgo } from '../lib/DateTimeFormats';

export default function MessageItem(props) {

  return (
    <Link className='message_item' to={`/messages/@`+props.message.handle}>
      <div className='message_avatar'></div>
      <div className='message_content'>
        <div classsName='message_meta'>
          <div className='message_identity'>
            <div className='display_name'>{props.message.display_name}</div>
            <div className="handle">@{props.message.handle}</div>
          </div>{/* activity_identity */}
        </div>{/* message_meta */}
        <div className="message">{props.message.message}</div>
        <div className="created_at" title={props.message.created_at}>
          <span className='ago'>{timeAgo(props.message.created_at)}</span> 
        </div>{/* created_at */}
      </div>{/* message_content */}
    </Link>
  );
}
