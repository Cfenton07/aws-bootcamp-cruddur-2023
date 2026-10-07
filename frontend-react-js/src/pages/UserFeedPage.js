import './UserFeedPage.css';
import React from "react";
import { useParams } from 'react-router-dom';

import DesktopNavigation  from '../components/DesktopNavigation';
import DesktopSidebar     from '../components/DesktopSidebar';
import ActivityFeed from '../components/ActivityFeed';
import ActivityForm from '../components/ActivityForm';
import ProfileHeading from '../components/ProfileHeading';
import ProfileForm from '../components/ProfileForm';
import ReplyForm from '../components/ReplyForm';

import { signOut } from 'aws-amplify/auth';
import { checkAuth, getAccessToken } from '../components/lib/CheckAuth';

export default function UserFeedPage() {
  const [activities, setActivities] = React.useState([]);
  const [profile, setProfile] = React.useState({});
  const [popped, setPopped] = React.useState(false);
  const [poppedProfile, setPoppedProfile] = React.useState(false);
  const [poppedReply, setPoppedReply] = React.useState(false);
  const [replyActivity, setReplyActivity] = React.useState({});
  const [user, setUser] = React.useState(null);

  const params = useParams();
  // The handle currently in the URL. A slow response for a profile the
  // user has already navigated away from must not overwrite the new one.
  const currentHandleRef = React.useRef(params.handle);
  currentHandleRef.current = params.handle;

  const loadData = async () => {
    const handle = params.handle;
    const headers = {};

    const accessToken = await getAccessToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    try {
      const backend_url = `${process.env.REACT_APP_BACKEND_URL}/api/activities/@${handle}`
      const res = await fetch(backend_url, {
        method: "GET",
        headers: headers,
      });
      let resJson = await res.json();
      if (handle !== currentHandleRef.current) {
        return;
      }
      if (res.status === 200) {
        console.log('PROFILE DATA:', resJson);
        setProfile(resJson.profile);
        setActivities(resJson.profile.activities);
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
    checkAuth(setUser);
  }, [])

  // Load on the first visit AND whenever :handle changes (backlog #48).
  // React Router keeps this component mounted for /@a -> /@b, so a
  // mount-only load kept showing the previous profile until a refresh.
  React.useEffect(()=>{
    setProfile({});
    setActivities([]);
    loadData();
  }, [params.handle])

  return (
    <article>
      <DesktopNavigation user={user} active={'profile'} setPopped={setPopped} handleSignOut={handleSignOut} />
      <div className='content'>
        <ActivityForm popped={popped} setActivities={setActivities} />
       <ProfileForm 
          profile={profile}
          popped={poppedProfile} 
          setPopped={setPoppedProfile}
          loadData={loadData}
        />
        {/* Reply popup, as on Home. Without it the reply icon on a profile did nothing. */}
        <ReplyForm
          activity={replyActivity}
          popped={poppedReply}
          setPopped={setPoppedReply}
          setActivities={setActivities}
          activities={activities}
        />
        <div className='activity_feed'>
          <ProfileHeading setPopped={setPoppedProfile} profile={profile} user={user} />
          <ActivityFeed
            setReplyActivity={setReplyActivity}
            setPopped={setPoppedReply}
            activities={activities}
          />
        </div>
      </div>
      <DesktopSidebar user={user} />
    </article>
  );
}