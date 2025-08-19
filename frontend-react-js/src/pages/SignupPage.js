import './SignupPage.css';
import React from "react";
import {ReactComponent as Logo} from '../components/svg/logo.svg';
import { Link } from "react-router-dom";

// [TODO] Authenication
import { signUp } from 'aws-amplify/auth';


export default function SignupPage() {

  // Username is Eamil
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  //const [errors, setErrors] = React.useState('');
  const [passwordConfirmation, setPasswordConfirmation] = React.useState('');
   // State for displaying errors
  const [cognitoErrors, setCognitoErrors] = React.useState('');

  // const onsubmit = async (event) => {
  //   event.preventDefault();
  //   console.log('SignupPage.onsubmit')
  //   // [TODO] Authenication
  //   Cookies.set('user.name', name)
  //   Cookies.set('user.username', username)
  //   Cookies.set('user.email', email)
  //   Cookies.set('user.password', password)
  //   Cookies.set('user.confirmation_code',1234)
  //   window.location.href = `/confirm?email=${email}`
  //   return false
  // }

   const onsubmit = async (event) => {
    setCognitoErrors(''); // Clear any previous errors on a new submit
    event.preventDefault();
    
    // Check if passwords match
    if (password !== passwordConfirmation) {
      setCognitoErrors("Passwords do not match.");
      return; // Stop the function if passwords don't match
    }

    try {
      // The new signUp function takes an object for user attributes.
      const { isSignUpComplete, nextStep } = await signUp({
        username: email, // Amplify v6 uses 'username' for the unique identifier
        password: password,
        options: {
            userAttributes: {
                name: name,
                email: email,
                preferred_username: username,
            },
            // Auto-sign in the user after they have been confirmed
        autoSignIn: true 
        }
      });

      //console.log(user);
      
     // For a successful sign-up, the nextStep will be 'CONFIRM_SIGN_UP'
      if (nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
          window.location.href = `/confirm?email=${email}`;
      } else {
          // If the sign-up is complete and no confirmation is needed, redirect the user
          // This is where auto-sign in would have taken effect
          window.location.href = "/";
      }

    } catch (error) {
      console.log('Error signing up: ', error);
      setCognitoErrors(error.message);
    }
  };

  const name_onchange = (event) => {
    setName(event.target.value);
  }
  const email_onchange = (event) => {
    setEmail(event.target.value);
  }
  const username_onchange = (event) => {
    setUsername(event.target.value);
  }
  const password_onchange = (event) => {
    setPassword(event.target.value);
  }
  const password_confirmation_onchange = (event) => {
    setPasswordConfirmation(event.target.value);
  }

  let el_errors;
  if (cognitoErrors){
    el_errors = <div className='errors'>{cognitoErrors}</div>;
  }

  return (
    <article className='signup-article'>
      <div className='signup-info'>
        <Logo className='logo' />
      </div>
      <div className='signup-wrapper'>
        <form 
          className='signup_form'
          onSubmit={onsubmit}
        >
          <h2>Sign up to create a Cruddur account</h2>
          <div className='fields'>
            <div className='field text_field name'>
              <label>Name</label>
              <input
                type="text"
                value={name}
                onChange={name_onchange} 
              />
            </div>

            <div className='field text_field email'>
              <label>Email</label>
              <input
                type="text"
                value={email}
                onChange={email_onchange} 
              />
            </div>

            <div className='field text_field username'>
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={username_onchange} 
              />
            </div>

            <div className='field text_field password'>
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={password_onchange} 
              />
            </div>
             {/* This is the missing password confirmation field */}
            <div className='field text_field password_confirmation'>
              <label>Password Confirmation</label>
              <input
                type="password"
                value={passwordConfirmation}
                onChange={password_confirmation_onchange} 
              />
            </div>
          </div>
          {el_errors}
          <div className='submit'>
            <button type='submit'>Sign Up</button>
          </div>
        </form>
        <div className="already-have-an-account">
          <span>
            Already have an account?
          </span>
          <Link to="/signin">Sign in!</Link>
        </div>
      </div>
    </article>
  );
}