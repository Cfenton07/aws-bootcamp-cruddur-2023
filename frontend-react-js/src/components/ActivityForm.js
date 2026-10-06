import './ActivityForm.css';
import React from "react";
import process from 'process';
import {ReactComponent as BombIcon} from './svg/bomb.svg';
import { getAccessToken } from './lib/CheckAuth';

// Same limit the backend enforces (create_activity.py). Counted in Unicode
// code points with Array.from(), exactly like Python's len(), so an emoji
// counts as 1 instead of 2 (backlog #36).
const MAX_CHARS = 280;

export default function ActivityForm(props) {
  const [count, setCount] = React.useState(0);
  const [message, setMessage] = React.useState('');
  const [ttl, setTtl] = React.useState('7-days');
  const [error, setError] = React.useState(null);

  const remaining = MAX_CHARS - count;
  const classes = []
  classes.push('count')
  if (remaining < 0){
    classes.push('err')
  }

  const onsubmit = async (event) => {
    event.preventDefault();
    setError(null);
    try {
      const backend_url = `${process.env.REACT_APP_BACKEND_URL}/api/activities`
      console.log('onsubmit payload', message)
      const accessToken = await getAccessToken();
      const res = await fetch(backend_url, {
        method: "POST",
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          message: message,
          ttl: ttl
        }),
      });
      let data = await res.json();
      if (res.status === 200) {
        // add activity to the feed
        props.setActivities(current => [data,...current]);
        // reset and close the form
        setCount(0)
        setMessage('')
        setTtl('7-days')
        props.setPopped(false)
      } else {
        // Used to fail silently (backlog #37).
        // The backend answers 422 for EVERY validation error (including
        // activity_not_saved), so check which one before blaming the length.
        console.log(res)
        if (Array.isArray(data) && data.includes('message_exceed_max_chars')) {
          setError(`Your Crud is over ${MAX_CHARS} characters.`);
        } else {
          setError(`Could not post (${res.status}). Please try again.`);
        }
      }
    } catch (err) {
      console.log(err);
      setError('Could not post. Please try again.');
    }
  }

  const textarea_onchange = (event) => {
    setCount(Array.from(event.target.value).length);
    setMessage(event.target.value);
  }

  const ttl_onchange = (event) => {
    setTtl(event.target.value);
  }

  if (props.popped === true) {
    return (
      <form 
        className='activity_form'
        onSubmit={onsubmit}
      >
        <textarea
          type="text"
          placeholder="what would you like to say?"
          value={message}
          onChange={textarea_onchange} 
        />
        {error && <div className='errors'>{error}</div>}
        <div className='submit'>
          <div className={classes.join(' ')}>{remaining}</div>
          <button type='submit' disabled={remaining < 0 || message.trim() === ''}>Crud</button>
          <div className='expires_at_field'>
            <BombIcon className='icon' />
            <select
              value={ttl}
              onChange={ttl_onchange} 
            >
              <option value='30-days'>30 days</option>
              <option value='7-days'>7 days</option>
              <option value='3-days'>3 days</option>
              <option value='1-day'>1 day</option>
              <option value='12-hours'>12 hours</option>
              <option value='3-hours'>3 hours</option>
              <option value='1-hour'>1 hour </option>
            </select>
          </div>
        </div>
      </form>
    );
  }
}
