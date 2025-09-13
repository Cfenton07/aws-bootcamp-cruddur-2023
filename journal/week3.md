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
The docker-compose.yml file is used to configure my application's environment, but it does not directly implement Cognito. Instead, it serves as the central location for providing the necessary credentials and connection details to my frontend and backend services, which then use them to interact with Cognito.

Frontend Service Configuration
The most direct link to Cognito is in the frontend-react-js service block. Here, the environment section exposes four crucial variables:

-- REACT_APP_AWS_PROJECT_REGION

-- REACT_APP_AWS_COGNITO_REGION

-- REACT_APP_AWS_USER_POOLS_ID

-- REACT_APP_CLIENT_ID

These values are pulled from my host environment and made available to my React application. When my frontend code (like the App.js file from our earlier conversation) uses the Amplify library, it reads these variables to know exactly which Cognito User Pool to connect to for all authentication-related tasks, such as signing up, signing in, and recovering passwords.

## Added backend authentication verification (updated my app.py file and added a new directory called lib)

```py
import time
import requests
from jose import jwk, jwt
from jose.exceptions import JOSEError
from jose.utils import base64url_decode

class FlaskAWSCognitoError(Exception):
  pass

class TokenVerifyError(Exception):
  pass

def extract_access_token(request_headers):
    access_token = None
    auth_header = request_headers.get("Authorization")
    if auth_header and " " in auth_header:
        _, access_token = auth_header.split()
    return access_token

class CognitoJwtToken:
    def __init__(self, user_pool_id, user_pool_client_id, region, request_client=None):
        self.region = region
        if not self.region:
            raise FlaskAWSCognitoError("No AWS region provided")
        self.user_pool_id = user_pool_id
        self.user_pool_client_id = user_pool_client_id
        self.claims = None
        if not request_client:
            self.request_client = requests.get
        else:
            self.request_client = request_client
        self._load_jwk_keys()


    def _load_jwk_keys(self):
        keys_url = f"https://cognito-idp.{self.region}.amazonaws.com/{self.user_pool_id}/.well-known/jwks.json"
        try:
            response = self.request_client(keys_url)
            self.jwk_keys = response.json()["keys"]
        except requests.exceptions.RequestException as e:
            raise FlaskAWSCognitoError(str(e)) from e

    @staticmethod
    def _extract_headers(token):
        try:
            headers = jwt.get_unverified_headers(token)
            return headers
        except JOSEError as e:
            raise TokenVerifyError(str(e)) from e

    def _find_pkey(self, headers):
        kid = headers["kid"]
        # search for the kid in the downloaded public keys
        key_index = -1
        for i in range(len(self.jwk_keys)):
            if kid == self.jwk_keys[i]["kid"]:
                key_index = i
                break
        if key_index == -1:
            raise TokenVerifyError("Public key not found in jwks.json")
        return self.jwk_keys[key_index]

    @staticmethod
    def _verify_signature(token, pkey_data):
        try:
            # construct the public key
            public_key = jwk.construct(pkey_data)
        except JOSEError as e:
            raise TokenVerifyError(str(e)) from e
        # get the last two sections of the token,
        # message and signature (encoded in base64)
        message, encoded_signature = str(token).rsplit(".", 1)
        # decode the signature
        decoded_signature = base64url_decode(encoded_signature.encode("utf-8"))
        # verify the signature
        if not public_key.verify(message.encode("utf8"), decoded_signature):
            raise TokenVerifyError("Signature verification failed")

    @staticmethod
    def _extract_claims(token):
        try:
            claims = jwt.get_unverified_claims(token)
            return claims
        except JOSEError as e:
            raise TokenVerifyError(str(e)) from e

    @staticmethod
    def _check_expiration(claims, current_time):
        if not current_time:
            current_time = time.time()
        if current_time > claims["exp"]:
            raise TokenVerifyError("Token is expired")  # probably another exception

    def _check_audience(self, claims):
        # and the Audience  (use claims['client_id'] if verifying an access token)
        audience = claims["aud"] if "aud" in claims else claims["client_id"]
        if audience != self.user_pool_client_id:
            raise TokenVerifyError("Token was not issued for this audience")

    def verify(self, token, current_time=None):
        """ https://github.com/awslabs/aws-support-tools/blob/master/Cognito/decode-verify-jwt/decode-verify-jwt.py """
        if not token:
            raise TokenVerifyError("No token provided")

        headers = self._extract_headers(token)
        pkey_data = self._find_pkey(headers)
        self._verify_signature(token, pkey_data)

        claims = self._extract_claims(token)
        self._check_expiration(claims, current_time)
        self._check_audience(claims)

        self.claims = claims 
        return claims
```

The 'cognito_jwt_token.py' is for validating a Cognito JWT token. It implements all the necessary steps in a logical and secure manner.

Here's a quick breakdown of why it works so well:

Helper Functions and Classes: The code is cleanly divided into a helper function (extract_access_token) and the main class (CognitoJwtToken). This makes it easy to read and maintain. The custom exceptions, FlaskAWSCognitoError and TokenVerifyError, also make error handling clear and specific.

Standard Verification Process: The verify method follows the correct standard for JWT validation. It performs a series of crucial checks:

Header and Key Extraction: It gets the kid (key ID) from the token's header to find the corresponding public key from the jwks.json file.

Signature Verification: This is a vital security step. The code uses the public key to cryptographically verify that the token hasn't been tampered with.

Claim Validation: It checks for the token's expiration date (exp) and ensures the audience (aud or client_id) matches the one expected by my application. This prevents the token from being used after it has expired or in the wrong context.

This design is exactly what I want for robust authentication in my Flask application. It fits perfectly into the try...except block I've set up in my app.py file because any validation failure will raise a TokenVerifyError, which my Flask app can then catch to serve the unauthenticated response.

## In the app.py file:

Summary of Authentication Logic
The core of the authentication changes is the data_home() function and its use of a try...except block. This block allows the endpoint to serve two different versions of the home feed: one for authenticated users and one for guests.

Authentication Attempt (try block):

The function first tries to get an access_token from the request's Authorization header.

It then calls cognito_jwt_token.verify(access_token). This is the most important part. The verify method checks if the token is valid, has a correct signature, and hasn't expired.

If all these checks pass, the verify method returns a claims object, which contains user information like the username.

The function then proceeds with the authenticated flow, calling HomeActivities.run(cognito_user_id=claims['username']) to fetch a personalized feed, and finally returns this data with a 200 status code.

Handling Unauthenticated Requests (except block):

If the access_token is missing or invalid (e.g., expired or tampered with), the cognito_jwt_token.verify() call will raise a TokenVerifyError.

The except TokenVerifyError as e: block catches this specific error.

The function then proceeds with the unauthenticated flow, calling HomeActivities.run() without any user ID. This returns a generic, non-personalized feed.

It then returns this data with a 200 status code.

This pattern is a robust and common way to handle optional authentication on an API endpoint. It allows I to use a single endpoint to serve both logged-in and logged-out users, providing a more seamless experience for my application's front end.

I also added a new feature to my HomeActivities page that personalizes the content for logged-in users.

Specifically, I implemented a conditional statement that checks if a cognito_user_id is present.

For authenticated users: If a user is logged in (i.e., cognito_user_id is not None), my code creates a new activity for a user named 'Lore' and adds it to the very beginning of the list.

For unauthenticated users: If a user is not logged in, the if block is skipped, and they will only see the original list of activities.

In short, I've successfully added a dynamic, personalized message that only appears at the top of the home feed for authenticated users.

## HomeFeeds Page also update:

HomeFeedPage.js file has been fixed for the blank page issue that occurred after signing out. The problem was that the code was designed to fetch data only when the user state was a non-null value, which meant it stopped fetching data when you signed out.

Here is a summary of the key changes I made:

Refactored loadData: The loadData function was updated to handle both authenticated and unauthenticated requests. It now attempts to get a session and an accessToken, but it's designed to continue even if no session is found. It then uses the headers object, which is now correctly defined, to conditionally add the Authorization token to the fetch request.

Simplified useEffect: I removed the second useEffect hook that was dependent on the user state. Now, a single useEffect hook calls both checkAuth() and loadData() when the component first loads. This ensures the app always attempts to load the home feed, regardless of whether a user is currently logged in or not.

These changes ensure that the frontend will always request data from the backend, and the backend (which we previously corrected) will respond with the appropriate public data when a user is signed out, preventing the blank page from appearing.

## I made some quality of life changes to the homepage UI. I modified the .css code in the frontend so that the color pallet appeared more readable and easier to the human eye to deal with:

![Cruddur Homepage:](https://github.com/Cfenton07/aws-bootcamp-cruddur-2023/blob/main/_docs/assets/Cruddur_%20UI_Changes(css%20code)%202025-09-13%20114957.png)
