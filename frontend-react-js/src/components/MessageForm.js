import './MessageForm.css';
import React from "react";
import process from 'process';
import { useParams } from 'react-router-dom';
import { fetchAuthSession } from 'aws-amplify/auth';

export default function ActivityForm(props) {
  const [count, setCount] = React.useState(0);
  const [message, setMessage] = React.useState('');
  const params = useParams();

  const classes = []
  classes.push('count')
  if (1024-count < 0){
    classes.push('err')
  }

  const onsubmit = async (event) => {
    event.preventDefault();
    
    // Initialize a header object
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    try {
      // Attempt to get the user session to get the access token
      const session = await fetchAuthSession();
      const accessToken = session?.tokens?.accessToken?.toString();

      // If an access token exists, add it to the headers
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

    } catch (err) {
      console.log('Error fetching session:', err);
      // Continue with the request even if there's no session
    }

    try {
      const backend_url = `${process.env.REACT_APP_BACKEND_URL}/api/messages`
      console.log('onsubmit payload', message)
      const res = await fetch(backend_url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          message: message,
          user_receiver_handle: params.handle
        }),
      });
      let data = await res.json();
      if (res.status === 200) {
        props.setMessages(current => [...current,data]);
      } else {
        console.log(res)
      }
    } catch (err) {
      console.log(err);
    }
  }

  const textarea_onchange = (event) => {
    setCount(event.target.value.length);
    setMessage(event.target.value);
  }

  return (
    <form 
      className='message_form'
      onSubmit={onsubmit}
    >
      <textarea
        type="text"
        placeholder="send a direct message..."
        value={message}
        onChange={textarea_onchange} 
      />
      <div className='submit'>
        <div className={classes.join(' ')}>{1024-count}</div>
        <button type='submit'>Message</button>
      </div>
    </form>
  );
}