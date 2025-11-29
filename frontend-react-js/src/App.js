import './App.css';

import HomeFeedPage from './pages/HomeFeedPage';
import NotificationsFeedPage from './pages/NotificationsFeedPage';
import UserFeedPage from './pages/UserFeedPage';
import SignupPage from './pages/SignupPage';
import SigninPage from './pages/SigninPage';
import RecoverPage from './pages/RecoverPage';
import MessageGroupsPage from './pages/MessageGroupsPage';
import MessageGroupPage from './pages/MessageGroupPage';
import ConfirmationPage from './pages/ConfirmationPage';
import React from 'react';
import {
  createBrowserRouter,
  RouterProvider
} from "react-router-dom";
import { Amplify } from 'aws-amplify';

// Using Amplify to configure AWS Cognito for decentralized authentication
Amplify.configure({
  /* This block of code is no longer needed. This set up was acceptable for amplify V5 but my app is pulling the packages for Amplify V6
  The syntax is different and the setup in nested for the configuration.
   "AWS_PROJECT_REGION": process.env.REACT_APP_AWS_PROJECT_REGION,
  // "aws_cognito_region": process.env.REACT_APP_AWS_COGNITO_REGION,
  // "aws_user_pools_id": process.env.REACT_APP_AWS_USER_POOLS_ID,
  // "aws_user_pools_web_client_id": process.env.REACT_APP_CLIENT_ID,
   "oauth": {},*/
  Auth: {
    Cognito: {
    // We are not using an Identity Pool
    // identityPoolId: process.env.REACT_APP_IDENTITY_POOL_ID, // REQUIRED - Amazon Cognito Identity Pool ID
    region: process.env.REACT_APP_AWS_PROJECT_REGION,           // REQUIRED - Amazon Cognito Region
    userPoolId: process.env.REACT_APP_AWS_USER_POOLS_ID,         // OPTIONAL - Amazon Cognito User Pool ID
    userPoolClientId: process.env.REACT_APP_CLIENT_ID,   // OPTIONAL - Amazon Cognito Client ID (26-char alphanumeric string)
  }
 }
});

const router = createBrowserRouter([
  {
    path: "/",
    element: <HomeFeedPage />
  },
  {
    path: "/notifications",
    element: <NotificationsFeedPage />
  },
  {
    path: "/@:handle",
    element: <UserFeedPage />
  },
  {
    path: "/messages",
    element: <MessageGroupsPage />
  },
  {
    path: "/messages/:message_group_uuid",
    element: <MessageGroupPage />
  },
  {
    path: "/signup",
    element: <SignupPage />
  },
  {
    path: "/signin",
    element: <SigninPage />
  },
  {
    path: "/confirm",
    element: <ConfirmationPage />
  },
  {
    path: "/forgot",
    element: <RecoverPage />
  }
]);

function App() {
  return (
    <>
      <RouterProvider router={router} />
    </>
  );
}

export default App;