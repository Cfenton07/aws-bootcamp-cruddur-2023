import './MessageGroupPage.css';
import React from "react";
import { useParams } from 'react-router-dom';

import DesktopNavigation  from '../components/DesktopNavigation';
import MessageGroupFeed from '../components/MessageGroupFeed';
import MessagesFeed from '../components/MessageFeed';
import MessagesForm from '../components/MessageForm';

import { checkAuth, getAccessToken } from '../components/lib/CheckAuth';
import { signOut } from 'aws-amplify/auth';

export default function MessageGroupPage() {
  const [messageGroups, setMessageGroups] = React.useState([]);
  const [messages, setMessages] = React.useState([]);
  const [popped, setPopped] = React.useState(false);
  const [user, setUser] = React.useState(null);
  const dataFetchedRef = React.useRef(false);
  const params = useParams();

  const loadMessageGroupsData = async () => {
    console.log('loadMessageGroupsData called');
    const headers = {};

    const accessToken = await getAccessToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    try {
      const backend_url = `${process.env.REACT_APP_BACKEND_URL}/api/message_groups`
      const res = await fetch(backend_url, {
        method: "GET",
        headers: headers,
      });
      // Status before parse: a 502 from the ALB is HTML and a 401 can be empty.
      // res.json() throws SyntaxError on both, which hides the real status.
      if (!res.ok) {
        console.log('message_groups failed', res.status);
        return;
      }
      const resJson = await res.json();
      setMessageGroups(resJson);
    } catch (err) {
      console.log(err);
    }
  };

  const loadMessageGroupData = async (message_group_uuid, shouldApply) => {
    console.log('loadMessageGroupData called', message_group_uuid);
    const headers = {};

    const accessToken = await getAccessToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    try {
      const backend_url = `${process.env.REACT_APP_BACKEND_URL}/api/messages/${message_group_uuid}`
      const res = await fetch(backend_url, {
        method: "GET",
        headers: headers,
      });
      if (!res.ok) {
        console.log('messages failed', res.status);
        return;
      }
      const resJson = await res.json();
      // Discard a response whose request has been superseded by a newer one.
      if (shouldApply()) {
        setMessages(resJson);
      }
    } catch (err) {
      console.log(err);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.href = "/";
    } catch (error) {
      console.log('Error signing out: ', error);
    }
  };

  // Runs once: auth and the left-hand conversation list.
  React.useEffect(() => {
    if (dataFetchedRef.current) return;
    dataFetchedRef.current = true;

    checkAuth(setUser);
    loadMessageGroupsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Runs on every route change. React Router REUSES this component when only
  // the param changes - it does not unmount - so an empty dependency array
  // left the right-hand panel showing the previous conversation until a
  // manual page refresh. The ignore flag discards a slow response that lands
  // after the user has already clicked a different group.
  React.useEffect(() => {
    let ignore = false;
    loadMessageGroupData(params.message_group_uuid, () => !ignore);
    return () => { ignore = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.message_group_uuid]);

  return (
    <article>
      <DesktopNavigation user={user} active={'home'} setPopped={setPopped} handleSignOut={handleSignOut} />
      <section className='message_groups'>
        <MessageGroupFeed message_groups={messageGroups} />
      </section>
      <div className='content messages'>
        <MessagesFeed messages={messages} />
        <MessagesForm setMessages={setMessages} />
      </div>
    </article>
  );
}
