import './MessageFeed.css';
import React from 'react';
import MessageItem from './MessageItem';

export default function MessageFeed(props) {
  const messagesEndRef = React.useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [props.messages]);

  return (
    <div className='message_feed'>
      <div className='message_feed_heading'>
        <div className='title'>Messages</div>
      </div>
      <div className='message_feed_collection'>
        {props.messages.map(message => {
          return <MessageItem key={message.uuid} message={message} />
        })}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}