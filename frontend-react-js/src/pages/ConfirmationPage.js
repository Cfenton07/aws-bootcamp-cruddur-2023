import './ConfirmationPage.css';
import React from "react";
//import { useParams } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import {ReactComponent as Logo} from '../components/svg/logo.svg';

// [TODO] Authenication
import { confirmSignUp, resendSignUpCode } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';

export default function ConfirmationPage() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  
  // FIX: Only extract the email from the URL.
  const initialEmail = params.get('email') || '';


  const [email, setEmail] = React.useState(initialEmail);
  const [code, setCode] = React.useState('');
  const [cognitoErrors, setCognitoErrors] = React.useState(''); // Changed here for consistency
  const [codeSent, setCodeSent] = React.useState(false);

  //const params = useParams();

  const code_onchange = (event) => {
    setCode(event.target.value);
  }
  // const email_onchange = (event) => {
  //   setEmail(event.target.value);
  // }

  const resend_code = async (event) => {
  setCognitoErrors(''); // It's better to use one error state variable
  try {
    // Amplify v6's resendSignUpCode takes a 'username' object
    await resendSignUpCode({ username: email });
    console.log('code resent successfully');
    setCodeSent(true);
  } catch (err) {
    console.log(err);
    // Error messages may vary, so it's safer to not rely on specific strings
    setCognitoErrors(err.message);
  }
};

const onsubmit = async (event) => {
  event.preventDefault();
  setCognitoErrors('');
  try {
      // Step 1: Confirm the user's email
      await confirmSignUp({ username: email, confirmationCode: code });
      
      // Step 2: Sign the user in immediately after confirmation
      //await signIn({ username: email });
      
      // Step: 3 Only redirect when the user is confirmed and signed in  
        window.location.href = "/";

  } catch (error) {
    console.log(error);
    setCognitoErrors(error.message);
  }
  return false;
};

    React.useEffect(() => {
      const hubListenerCancelToken = Hub.listen('auth', ({ payload }) => {
        // Check for a 'signedIn' event
        if (payload.event === 'signedIn') {
        // Only redirect when the user is confirmed and signed in  
        window.location.href = "/";
        }
      });

    // Cleanup the listener when the component unmounts
       return () => hubListenerCancelToken();
       
    }, []);    


  let code_button;
  if (codeSent){
    code_button = <div className="sent-message">A new activation code has been sent to your email</div>
  } else {
    code_button = <button className="resend" onClick={resend_code}>Resend Activation Code</button>;
  }


  return (
    <article className="confirm-article">
      <div className='recover-info'>
        <Logo className='logo' />
      </div>
      <div className='recover-wrapper'>
        <form
          className='confirm_form'
          onSubmit={onsubmit}
        >
          <h2>Confirm your Email</h2>
          <div className='fields'>
            <div className='field text_field email'>
              <label>Email</label>
              <input
                type="text"
                value={email}
                //onChange={email_onchange}
                disabled={true} 
              />
            </div>
            <div className='field text_field code'>
              <label>Confirmation Code</label>
              <input
                type="text"
                value={code}
                onChange={code_onchange} 
              />
            </div>
          </div>
          {cognitoErrors && <div className='errors'>{cognitoErrors}</div>}
          <div className='submit'>
            <button type='submit'>Confirm Email</button>
          </div>
        </form>
      </div>
      {code_button}
    </article>
  );
}