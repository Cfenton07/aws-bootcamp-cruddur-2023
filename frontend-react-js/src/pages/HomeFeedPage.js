import './HomeFeedPage.css';
import React from "react";

import DesktopNavigation  from '../components/DesktopNavigation';
import DesktopSidebar     from '../components/DesktopSidebar';
import ActivityFeed from '../components/ActivityFeed';
import ActivityForm from '../components/ActivityForm';
import ReplyForm from '../components/ReplyForm';

// [TODO] Authenication
import { getCurrentUser, signOut, fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth';

export default function HomeFeedPage() {
  const [activities, setActivities] = React.useState([]);
  const [popped, setPopped] = React.useState(false);
  const [poppedReply, setPoppedReply] = React.useState(false);
  const [replyActivity, setReplyActivity] = React.useState({});
  const [user, setUser] = React.useState(null);
  //const dataFetchedRef = React.useRef(false);

   const loadData = async () => {
    console.log('user', user);
    try {
       // Get the authentication session to retrieve the access token
      const session = await fetchAuthSession();
      const accessToken = session.tokens.accessToken.toString();

      const backend_url = `${process.env.REACT_APP_BACKEND_URL}/api/activities/home`;
      
      // Pass the access token in the Authorization header
      const res = await fetch(backend_url, {
        method: "GET",
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
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

  const checkAuth = async () => {
    console.log('checkAuth');
    try {
      // Force refresh of the user session to ensure all attributes are available
      const { tokens } = await fetchAuthSession({ forceRefresh: true });

      // Use getCurrentUser() to get the user's details
      const cognitoUser = await getCurrentUser();

      // Fetch the full list of user attributes
      const userAttributes = await fetchUserAttributes();

      setUser({
        //display_name: displayName,
        //handle: cognitoUser.username,
        display_name: userAttributes.name,
        handle: userAttributes.preferred_username,
        // The sub is a useful identifier for many back-end calls
        cognito_user_id: userAttributes.sub
      });

      console.log('User is authenticated:', cognitoUser);

    } catch (err) {
      console.log('User is not authenticated:', err);
      // Set user to null if not authenticated
      setUser(null);
    }
  };

  // New function to handle sign out
  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.href = "/"; // Redirects to the home page after sign-out
    } catch (error) {
      console.log('Error signing out: ', error);
    }
  };

  // React.useEffect(()=>{
  //   // Prevents double call
  //   if (dataFetchedRef.current) return;
  //   dataFetchedRef.current = true;

  //   loadData();
  //   checkAuth();
  // }, []);

  React.useEffect(() => {
    // This effect runs on component mount and checks for auth status
    checkAuth();
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