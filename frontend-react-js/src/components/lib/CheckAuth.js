import { getCurrentUser, fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth';

const checkAuth = async (setUser) => {
  console.log('checkAuth');
  try {
    await fetchAuthSession({ forceRefresh: true });
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
};

export default checkAuth;

