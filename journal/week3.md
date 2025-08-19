# Week 3 — Decentralized Authentication

## Implemented Cognito to handle the authentication process by doing the following to my front end react components (.js pages):

- App.js: 

The main entry point for the entire React application. It serves two primary functions: configuring the authentication service and setting up the application's routing.

Authentication Configuration
The file configures AWS Amplify to use a specific Cognito User Pool for user authentication. It uses environment variables (.env file) to get the required credentials, such as the region, userPoolId, and userPoolClientId. This setup allows other components, like the SigninPage and SignupPage, to securely interact with the AWS backend to manage users. The commented-out code block shows a previous configuration method from Amplify v5, which highlights the migration to the new v6 syntax.

- Homefeed:
On the HomefeedPage, the main objective was to properly authenticate the user and display their information. We replaced the old Cookies library with the new Amplify v6 authentication APIs, specifically:

getCurrentUser(): Fetches the basic user object.

fetchAuthSession(): Ensures the user's session is active and up-to-date.

fetchUserAttributes(): Retrieves a full list of user details (like name and username) that were set during sign-up.

This change means the page now reliably identifies who is logged in and correctly displays their name and handle, providing a much more stable user experience. We also added a handleSignOut() function that uses the signOut() API to securely log the user out.

- Signup and Confirmation:
For user registration, we overhauled the SignupPage and ConfirmationPage to work seamlessly together.

On the SignupPage, we replaced the old Cookies logic with the new signUp() function from Amplify v6. This function now handles creating the user in Cognito, and we pass all the necessary attributes (like name and email) as part of the sign-up process. We also added a critical check to ensure the user's password and password confirmation fields match before attempting to sign up.

The ConfirmationPage was then updated to use the new confirmSignUp() and resendSignUpCode() functions. Instead of relying on manual state checks, we implemented an Amplify Hub listener. This listener is a powerful new feature that waits for an authentication event—specifically, a signedIn event—before redirecting the user. This guarantees the user is fully confirmed and authenticated before they are sent to the home feed, preventing potential login issues.

- Password Recovery:
Finally, on the RecoverPage, we cleaned up the code and fixed the core logic.

We removed unnecessary state variables and a useEffect hook that was polling for Amplify to be ready, as the new APIs are directly available.

The crucial fix was to correctly import the resetPassword and confirmResetPassword functions from aws-amplify/auth using named imports.

We also replaced the loose == comparisons with the stricter === for improved code reliability.

These updates mean the password recovery process is now fully functional, securely sending a code to the user and allowing them to reset their password without any errors.

In short, the entire authentication flow—from signing up to signing in and recovering a password—is now correctly implemented using the latest Amplify v6 APIs, making the application more secure, stable, and maintainable.

summarize what the SigninPage is doing.

- The SigninPage:
Is responsible for authenticating a user with a valid email (or username) and password. Its primary goal is to verify the user's credentials with Amazon Cognito and, if successful, redirect them to the home page.

Key Changes and Functionality
The core of the updated SigninPage is the move from the old, manual Cookies authentication method to the new signIn() function from Amplify v6.

Authentication API: The page now imports and uses signIn() directly from 'aws-amplify/auth'. This function handles the entire authentication flow with Cognito, removing the need for us to manage cookies or local storage manually.

Error Handling: A try/catch block now surrounds the signIn call. If the authentication fails (for instance, due to incorrect credentials), a cognitoErrors state variable is set, and the error message is displayed on the screen.

User Not Confirmed: The code includes a specific check for a 'UserNotConfirmedException' error. This is a very useful feature because if a user tries to sign in without confirming their account first, the app can automatically redirect them to the ConfirmationPage, guiding them to complete the sign-up process.

Redirection: If the signIn call is successful, the nextStep.signInStep will be 'DONE', and the application will be redirected to the home page (/). This ensures the user is fully logged in before they can access the content.

In essence, the SigninPage is now a robust and streamlined authentication component that securely handles user logins using the modern Amplify v6 library, providing a better user experience and more reliable error handling.

 - Docker_Compose:
The docker-compose.yml file is used to configure your application's environment, but it does not directly implement Cognito. Instead, it serves as the central location for providing the necessary credentials and connection details to your frontend and backend services, which then use them to interact with Cognito.

Frontend Service Configuration
The most direct link to Cognito is in the frontend-react-js service block. Here, the environment section exposes four crucial variables:

-- REACT_APP_AWS_PROJECT_REGION

-- REACT_APP_AWS_COGNITO_REGION

-- REACT_APP_AWS_USER_POOLS_ID

-- REACT_APP_CLIENT_ID

These values are pulled from your host environment and made available to your React application. When your frontend code (like the App.js file from our earlier conversation) uses the Amplify library, it reads these variables to know exactly which Cognito User Pool to connect to for all authentication-related tasks, such as signing up, signing in, and recovering passwords.
