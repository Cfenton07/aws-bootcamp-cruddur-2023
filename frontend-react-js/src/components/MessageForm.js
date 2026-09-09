import './MessageForm.css';
import React from "react";
import process from 'process';
import { useParams } from 'react-router-dom';
import { getAccessToken } from './lib/CheckAuth';

export default function MessageForm(props) {
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
    
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    const accessToken = await getAccessToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }



    try {
      const backend_url = `${process.env.REACT_APP_BACKEND_URL}/api/messages`
      console.log('onsubmit payload', message)
      
      // Build the request body
      let json = { 'message': message }
      if (params.handle) {
        json.handle = params.handle  // ✅ Match backend
      } else {
        json.message_group_uuid = params.message_group_uuid
      }

      const res = await fetch(backend_url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(json)
      });
      
      // Check the status BEFORE touching the body. A 502 from the ALB is HTML,
      // a 401 can be empty, and a Flask traceback is neither: res.json() throws
      // a SyntaxError on all three, which used to escape to the outer catch.
      if (!res.ok) {
        // res.json() consumes the body, so a clone is kept for the text fallback.
        const res_text_fallback = res.clone();
        let detail;
        try {
          detail = await res.json();
        } catch (json_err) {
          try {
            detail = await res_text_fallback.text();
          } catch (text_err) {
            detail = '';
          }
        }
        // TODO: surface this failure to the user. This component has no
        // error-display mechanism (no errors state, no shared FormErrors
        // component, no toast), and there is none elsewhere in the app to
        // reuse, so wiring (c) up would mean inventing new UI. Until that
        // exists the send fails silently: the textarea keeps its text and
        // nothing appears on screen.
        console.log('message send failed', res.status, detail)
        return
      }

      let data = await res.json();
      console.log('data:', data)

      // If backend returns a message_group_uuid, it's a new conversation - redirect
      if (data.message_group_uuid) {
        console.log('redirect to message group')
        window.location.href = `/messages/${data.message_group_uuid}`
      } else {
        // Otherwise, update the existing conversation
        props.setMessages(current => [...current, data]);
        setMessage(''); // Clear the input after sending
        setCount(0); // Reset character count
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