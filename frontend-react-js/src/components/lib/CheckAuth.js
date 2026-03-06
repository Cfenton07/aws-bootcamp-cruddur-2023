import { getCurrentUser, fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth';

export async function getAccessToken() {
  try {
    const session = await fetchAuthSession();
    const accessToken = session?.tokens?.accessToken?.toString();
    return accessToken;
  } catch (err) {
    console.log('Error getting access token:', err);
    return null;
  }
}

export async function checkAuth(setUser) {
  console.log('checkAuth');
  try {
    await fetchAuthSession({ forceRefresh: false });
    const cognitoUser = await getCurrentUser();
    const userAttributes = await fetchUserAttributes();
    setUser({
      display_name: userAttributes.name,
      handle: userAttributes.preferred_username,
      cognito_user_id: userAttributes.sub
    });
    console.log('User is authenticated:', cognitoUser);
    return cognitoUser;
  } catch (err) {
    console.log('User is not authenticated:', err);
    setUser(null);
    return null;
  }
}

