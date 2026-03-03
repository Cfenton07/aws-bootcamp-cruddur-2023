import './UserFeedPage.css';
import React from "react";
import { useParams } from 'react-router-dom';

import DesktopNavigation  from '../components/DesktopNavigation';
import DesktopSidebar     from '../components/DesktopSidebar';
import ActivityFeed from '../components/ActivityFeed';
import ActivityForm from '../components/ActivityForm';

import { signOut } from 'aws-amplify/auth';
import { checkAuth, getAccessToken } from '../components/lib/CheckAuth';

export default function UserFeedPage() {
  const [activities, setActivities] = React.useState([]);
  const [popped, setPopped] = React.useState([]);
  const [user, setUser] = React.useState(null);
  const dataFetchedRef = React.useRef(false);

  const params = useParams();
  const title = `@${params.handle}`;

  const loadData = async () => {
    const headers = {};

    const accessToken = await getAccessToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    try {
      const backend_url = `${process.env.REACT_APP_BACKEND_URL}/api/activities/${title}`
      const res = await fetch(backend_url, {
        method: "GET",
        headers: headers,
      });
      let resJson = await res.json();
      if (res.status === 200) {
        setActivities(resJson)
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
    loadData();
  }, [])

  return (
    <article>
      <DesktopNavigation user={user} active={'profile'} setPopped={setPopped} handleSignOut={handleSignOut} />
      <div className='content'>
        <ActivityForm popped={popped} setActivities={setActivities} />
        <ActivityFeed title={title} activities={activities} />
      </div>
      <DesktopSidebar user={user} />
    </article>
  );
}