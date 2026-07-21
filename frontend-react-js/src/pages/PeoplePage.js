import './PeoplePage.css';
import React from "react";
import { Link } from 'react-router-dom';

import DesktopNavigation  from '../components/DesktopNavigation';
import DesktopSidebar     from '../components/DesktopSidebar';
import ProfileAvatar from '../components/ProfileAvatar';

import { signOut } from 'aws-amplify/auth';
import { checkAuth, getAccessToken } from '../components/lib/CheckAuth';

export default function PeoplePage() {
  const [people, setPeople] = React.useState([]);
  const [popped, setPopped] = React.useState(false);
  const [user, setUser] = React.useState(null);
  const dataFetchedRef = React.useRef(false);

  const loadData = async () => {
    const headers = {};

    const accessToken = await getAccessToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    try {
      const backend_url = `${process.env.REACT_APP_BACKEND_URL}/api/users`
      const res = await fetch(backend_url, {
        method: "GET",
        headers: headers,
      });
      let resJson = await res.json();
      if (res.status === 200) {
        setPeople(resJson)
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
      <DesktopNavigation user={user} active={'people'} setPopped={setPopped} handleSignOut={handleSignOut} />
      <div className='content'>
        <div className='activity_feed'>
          <div className='activity_feed_heading'>
            <div className='title'>People</div>
          </div>
          <div className='people_list'>
            {people.map(person => {
              return (
                <Link className="user" to={'/@' + person.handle} key={person.uuid}>
                  <ProfileAvatar id={person.cognito_user_id} />
                  <div className='identity'>
                    <span className="display_name">{person.display_name}</span>
                    <span className="handle">@{person.handle}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
      <DesktopSidebar user={user} />
    </article>
  );
}
