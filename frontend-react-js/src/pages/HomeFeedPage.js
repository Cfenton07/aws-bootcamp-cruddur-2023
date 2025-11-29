import './HomeFeedPage.css';
import React from "react";

import DesktopNavigation  from '../components/DesktopNavigation';
import DesktopSidebar     from '../components/DesktopSidebar';
import ActivityFeed from '../components/ActivityFeed';
import ActivityForm from '../components/ActivityForm';
import ReplyForm from '../components/ReplyForm';        

import { signOut, fetchAuthSession } from 'aws-amplify/auth';
import checkAuth from '../components/lib/CheckAuth';

export default function HomeFeedPage() {
  const [activities, setActivities] = React.useState([]);
  const [popped, setPopped] = React.useState(false);
  const [poppedReply, setPoppedReply] = React.useState(false);
  const [replyActivity, setReplyActivity] = React.useState({});
  const [user, setUser] = React.useState(null);

  const loadData = async () => {
    console.log('loadData called');
    // Initialize a header object
    const headers = {};

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

    const backend_url = `${process.env.REACT_APP_BACKEND_URL}/api/activities/home`;

    try {
      const res = await fetch(backend_url, {
        method: "GET",
        headers: headers,
      });

      const resJson = await res.json();
      if (res.status === 200) {
        setActivities(resJson)
      } else {
        console.log(res);
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

  React.useEffect(() => {
    // This useEffect will run once when the component is mounted
    // to check the user's authentication status and then load data
    checkAuth(setUser);
    loadData();
  }, []);

  React.useEffect(() => {
    // This effect runs whenever the `user` state changes
    // It will trigger loadData only after a user is authenticated
    if (user) {
      loadData(user);
    }
  }, [user]);

  return (
    <article>
      <DesktopNavigation user={user} active={'home'} setPopped={setPopped} handleSignOut={handleSignOut} />
      <div className='content'>
        <ActivityForm  
          popped={popped}
          setPopped={setPopped} 
          setActivities={setActivities} 
        />
        <ReplyForm 
          activity={replyActivity} 
          popped={poppedReply} 
          setPopped={setPoppedReply} 
          setActivities={setActivities} 
          activities={activities} 
        />
        <ActivityFeed 
          title="Home" 
          setReplyActivity={setReplyActivity} 
          setPopped={setPoppedReply} 
          activities={activities} 
        />
      </div>
      <DesktopSidebar user={user} />
    </article>
  );
}