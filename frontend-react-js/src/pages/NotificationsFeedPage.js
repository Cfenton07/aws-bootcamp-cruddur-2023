import './NotificationsFeedPage.css';
import React from "react";

import DesktopNavigation  from '../components/DesktopNavigation';
import DesktopSidebar     from '../components/DesktopSidebar';
import ActivityFeed from '../components/ActivityFeed';

import { signOut } from 'aws-amplify/auth';
import { checkAuth } from '../components/lib/CheckAuth';

// Notifications are not built yet (backlog #31). The backend endpoint still
// returns bootcamp demo data, so this page no longer fetches it and shows an
// empty state instead (backlog #24).
export default function NotificationsFeedPage() {
  const [user, setUser] = React.useState(null);
  const dataFetchedRef = React.useRef(false);

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
  }, [])

  return (
    <article>
      <DesktopNavigation user={user} active={'notifications'} handleSignOut={handleSignOut} />
      <div className='content'>
        <ActivityFeed title="Notifications" banner="notifications" activities={[]} />
        <div
          className='notifications_empty'
          style={{ padding: '16px', color: 'rgba(255,255,255,0.5)' }}
        >
          No notifications yet.
        </div>
      </div>
      <DesktopSidebar user={user} />
    </article>
  );
}
