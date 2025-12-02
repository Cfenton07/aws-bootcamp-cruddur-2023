import './MessageFeed.css';
import React from 'react';
import MessageItem from './MessageItem';

export default function MessageFeed(props) {
  const messagesFeedRef = React.useRef(null); // Reference to the scrollable container

  React.useEffect(() => {
    // Directly scroll the container to bottom
    if (messagesFeedRef.current) {
      messagesFeedRef.current.scrollTop = messagesFeedRef.current.scrollHeight;
    }
  }, [props.messages]);

  return (
    <div className='message_feed'>
      <div className='message_feed_heading'>
        <div className='title'>Messages</div>
      </div>
      <div className='message_feed_collection' ref={messagesFeedRef}>
        {props.messages.map(message => {
          return <MessageItem key={message.uuid} message={message} />
        })}
      </div>
    </div>
  );
}

//---------------------------------------------------------------------
// Old code logic for deafult auto scroll to bottom. Issue THe whoe web page would scroll to the bottom and cause page to be misaligned. 
// The Code above only scrolls the message feed div. secdtion
//--------------------------------------------------------------------- 

// export default function MessageFeed(props) {
//   const messagesEndRef = React.useRef(null);


// const scrollToBottom = () => {
//     setTimeout(() => {
//       messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
//     }, 100); // Small delay to wait for render
//   };

//   React.useEffect(() => {
//     scrollToBottom();
//   }, [props.messages]);

//   return (
//     <div className='message_feed'>
//       <div className='message_feed_heading'>
//         <div className='title'>Messages</div>
//       </div>
//       <div className='message_feed_collection'>
//         {props.messages.map(message => {
//           return <MessageItem key={message.uuid} message={message} />
//         })}
//         <div ref={messagesEndRef} />
//       </div>
//     </div>
//   );
// }