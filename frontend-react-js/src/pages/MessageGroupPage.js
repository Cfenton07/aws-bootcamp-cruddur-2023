import './MessageGroupPage.css';
import React from "react";
import { useParams } from 'react-router-dom';

import DesktopNavigation  from '../components/DesktopNavigation';
import MessageGroupFeed from '../components/MessageGroupFeed';
import MessagesFeed from '../components/MessageFeed';
import MessagesForm from '../components/MessageForm';
import checkAuth from '../components/lib/CheckAuth';

import { signOut, fetchAuthSession } from 'aws-amplify/auth';

export default function MessageGroupPage() {
  const [messageGroups, setMessageGroups] = React.useState([]);
  const [messages, setMessages] = React.useState([]);
  const [popped, setPopped] = React.useState(false);
  const [user, setUser] = React.useState(null);
  const dataFetchedRef = React.useRef(false);
  const params = useParams();

  const loadMessageGroupsData = async () => {
    console.log('loadMessageGroupsData called');
    // Initialize a header object
    const headers = {};

    try {
      // Attempt to get the user session to get the access token
      const session = await fetchAuthSession();
      const accessToken = session?.tokens?.accessToken;

      // If an access token exists, add it to the headers
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

    } catch (err) {
      console.log('Error fetching session:', err);
      // Continue with the request even if there's no session
    }

    try {
      const backend_url = `${process.env.REACT_APP_BACKEND_URL}/api/message_groups`
      const res = await fetch(backend_url, {
        method: "GET",
        headers: headers,
      });
      let resJson = await res.json();
      if (res.status === 200) {
        setMessageGroups(resJson)

      } else {
        console.log(res)
      }
    } catch (err) {
      console.log(err);
    }
  };  


  const loadMessageGroupData = async () => {
    console.log('loadMessageGroupData called');
    // Initialize a header object
    const headers = {};

    try {
      // Attempt to get the user session to get the access token
      const session = await fetchAuthSession();
      const accessToken = session?.tokens?.accessToken;

      // If an access token exists, add it to the headers
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

    } catch (err) {
      console.log('Error fetching session:', err);
      // Continue with the request even if there's no session
    }

    try {
      const handle = `@${params.handle}`;
      const backend_url = `${process.env.REACT_APP_BACKEND_URL}/api/messages/${params.message_group_uuid}`
      const res = await fetch(backend_url, {
        method: "GET",
        headers: headers,
      });
      let resJson = await res.json();
      if (res.status === 200) {
        setMessages(resJson)
      } else {
        console.log(res)
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

  React.useEffect(()=>{
    //prevents double call
    if (dataFetchedRef.current) return;
    dataFetchedRef.current = true;

    checkAuth(setUser);
    loadMessageGroupsData();
    loadMessageGroupData();
  }, [])

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