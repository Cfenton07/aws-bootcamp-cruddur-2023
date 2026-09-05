import './ReplyForm.css';
import React from "react";
import process from 'process';

import ActivityContent  from '../components/ActivityContent';
import { getAccessToken } from './lib/CheckAuth';

export default function ReplyForm(props) {
  const [count, setCount] = React.useState(0);
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState(null);

  const setPopped = props.setPopped;

  const classes = []
  classes.push('count')
  if (240-count < 0){
    classes.push('err')
  }

  // One exit point for every way the popup can close, so it never reopens
  // holding the previous attempt's text or error.
  const close = React.useCallback(() => {
    setCount(0);
    setMessage('');
    setError(null);
    setPopped(false);
  }, [setPopped]);

  // Escape closes. Only bound while the popup is open.
  React.useEffect(() => {
    if (props.popped !== true) return;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [props.popped, close]);

  // Clicking the dimmed backdrop closes; clicking inside the dialog does not.
  const onBackdropClick = (event) => {
    if (event.target === event.currentTarget) close();
  };

  const onsubmit = async (event) => {
    event.preventDefault();
    setError(null);

    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    // Every other fetch in this app sends a bearer token; this one did not.
    const accessToken = await getAccessToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    try {
      const backend_url = `${process.env.REACT_APP_BACKEND_URL}/api/activities/${props.activity.uuid}/reply`
      const res = await fetch(backend_url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ message: message }),
      });

      // Status before parse. A 502 from the ALB is HTML and a 401 can be empty;
      // res.json() throws SyntaxError on both and hides the real status.
      if (!res.ok) {
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
        console.log('reply failed', res.status, detail);
        setError(`Could not post reply (${res.status}). Please try again.`);
        return;
      }

      const data = await res.json();

      const activities_deep_copy = JSON.parse(JSON.stringify(props.activities))
      const found_activity = activities_deep_copy.find(function (element) {
        return element.uuid === props.activity.uuid;
      });

      if (found_activity) {
        // home.sql does not return a replies array, so this must not assume
        // one exists. Pushing onto undefined was throwing into the outer catch
        // and leaving the popup open with no explanation.
        if (!Array.isArray(found_activity.replies)) {
          found_activity.replies = [];
        }
        found_activity.replies.push(data)
        props.setActivities(activities_deep_copy);
      }

      close();
    } catch (err) {
      console.log(err);
      setError('Could not post reply. Please try again.');
    }
  }

  const textarea_onchange = (event) => {
    setCount(event.target.value.length);
    setMessage(event.target.value);
  }

  let content;
  if (props.activity){
    content = <ActivityContent activity={props.activity} />;
  }

  if (props.popped === true) {
    return (
      <div className="popup_form_wrap" onClick={onBackdropClick}>
        <div className="popup_form">
          <div className="popup_heading">
            <div className="popup_title">Reply</div>
            <div
              className="popup_close"
              onClick={close}
              role="button"
              tabIndex={0}
              aria-label="Close"
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') close(); }}
            >&times;</div>
          </div>
          <div className="popup_content">
            <div className="activity_wrap">
              {content}
            </div>
            {error && <div className='errors'>{error}</div>}
            <form
              className='replies_form'
              onSubmit={onsubmit}
            >
              <textarea
                type="text"
                placeholder="what is your reply?"
                value={message}
                onChange={textarea_onchange}
              />
              <div className='submit'>
                <div className={classes.join(' ')}>{240-count}</div>
                <button type='submit'>Reply</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
