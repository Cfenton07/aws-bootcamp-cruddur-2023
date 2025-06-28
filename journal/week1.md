# Week 1 — App Containerization

## Simple commands to start or stop my created containers:
### To start all stopped Docker containers on your system, you can use the following command, which utilizes a sub-command docker ps -aq to get a list of all container IDs (both running and stopped)
docker start $(docker ps -aq)
### To stop Docker containers in the terminal, use the docker stop command followed by the container ID or name. For example, to stop a container named "my_container", you would use: docker stop my_container. To stop all running containers, you can use: 
docker stop $(docker ps -q)

> Gitpod make sure to install the docker extension
## Containerized Backend
### Run Flask

```sh
cd backend-flask
export FRONTEND_URL="*"
export BACKEND_URL="*"
python3 -m flask run --host=0.0.0.0 --port=4567
cd ..
```
- This can all be checked after building the backend container with environmental variables set.
- make sure to unlock the port on the port tab next to the terminal (This will make the container public)
- open the link for port 4567 in your web browser
-  make sure to update the url with the finishing path **api/activities/home**. The full path should look like this: "https://4567-cfenton07-awsbootcampcr-qy3ay4ksobg.ws-us120.gitpod.io/api/activities/home"
-  you should now see json


### Add docker file BackEnd
```yaml
FROM python:3.10-slim-buster

# Inside Container
# Making a new folder inside the container
WORKDIR /backend-flask

# Copy from Outside Container --> To Inside Container
# This contains the libraries we want installed
COPY requirements.txt requirements.txt

# Inside Container
# This will install the python libraries used for the app inside the container
RUN pip3 install -r requirements.txt

# Copy from Outside Container --> To Inside Container
# The (.) means everything in the current directory
# The first (.) means everything "outside" the /backend-flask container
# The second (.) means everything "inside" the /backend-flask container
COPY . . 

# Set environment variables or (Env Vars)
# This is set inside of the container and remains set when the container is running
ENV FLASK_ENV=development

EXPOSE ${PORT}

# CMD (Command) 
# python3 -m flask run --host=0.0.0.0 --port=4567
CMD ["python3", "-m", "flask", "run", "--host=0.0.0.0", "--port=4567"]
```
### Add docker file FrontEnd (Note I must go into my frontend directory and do a "npm i" CMD for the install)
```yml
FROM node:16.18

ENV PORT=3000

COPY . /frontend-react-js
WORKDIR /frontend-react-js
RUN npm install
EXPOSE ${PORT}
CMD ["npm", "start"]
```
### Build Container (This will download & build my container image)(Make sure to cd into the backed directory to run this CMD to download and build the container image)
```sh
docker build -t backend-flask ./backend-flask
```
### Run Container
```sh
docker run --rm -p 4567:4567 -it backend-flask
FRONTEND_URL="*" BACKEN_URL="*" docker run --rm -p 4567:4567 -it backend-flask
docker run --rm -p 4567:4567 -it backend-flask -e FRONTEND_URL -e BACKEN_URL
export FRONTEND_URL="*"
export BACKEND_URL="*"
set FRONTEND_URL='*' (set Frontend and backend URLs first)
set BACKEND_URL='*'
docker run --rm -p 4567:4567 -it -e FRONTEND_URL='*' -e BACKEND_URL='*' backend-flask (<<Use this command line to run my container with environmental variables after I download and build the container image)
unset FRONTEND_URL='*'
unset BACKEND_URL='*'
```
#### Note to self ... I need to figure out a way to create a bash script to run the cmd's that build and setup my back end container. May need to also do the same with the frontend

### Run in the background
```sh
docker run --rm -p 4567:4567 -d backend-flask
```
### Return the container id into an ENV Vat
```sh
CONTAINER_ID= $(docker run --rm -p 4567:4567 -d backend-flask)
```
| docker container run is idiomatic, docker run is legacy syntax but is commonly used

### Get Container Images or Running Container IDs
```sh
docker ps
docker images
```
### Send Curl to Test Server
```sh

```
# This yml code in the docker-compose file will allow us to run/orchestrate multiple containers at the same time
```yml
version: "3.8"
services:
  backend-flask:
    environment:
      FRONTEND_URL: "https://3000-${GITPOD_WORKSPACE_ID}.${GITPOD_WORKSPACE_CLUSTER_HOST}"
      BACKEND: "https://4567-${GITPOD_WORKSPACE_ID}.${GITPOD_WORKSPACE_CLUSTER_HOST}"
    build: ./backend-flask
    ports:
      - "4567:4567"
    volumes:
      - ./backend-flask:/backendflasktype
  frontend-react-js:
    environment:
      REACT_APP_BACKEND_URL: "https://4567-${GITPOD_WORKSPACE_ID}.${GITPOD_WORKSPACE_CLUSTER_HOST}"
    build: ./frontend-react-js
    ports:
      - "3000:3000"
    volumes:
      - ./frontend-react-js:/frontend-react-js

# the name flag is a hack to change the default prepend folder
# name when outputting the image names
networks:
  internal-network:
    driver: bridge
    name: crudder
```
### Notes for myself: By the end of week 1 I performed the following...to some this up. I add my new endpoint to the directory called "services" and then I navigate to application entry point or app.py file to add the path for that new endpoint which essentially is mapping the URL to the to the code that will process requests. Is this accurate?

Yes, that is an excellent and highly accurate summary of the process described for adding a new endpoint to the Flask backend!

You've captured all the key steps and the underlying concepts perfectly:

"I add my new endpoint to the directory called 'services'": This refers to creating the Python file (like notifications_activities.py) within the services directory, which holds the logic and processing code for your new endpoint.
"and then I navigate to application entry point or app.py file": This correctly identifies app.py as the central place for routing.
"to add the path for that new endpoint which essentially is mapping the URL to the to the code that will process requests": This precisely describes the function of defining the route in app.py – it tells Flask, "When you see this URL (/api/activities/notifications), execute the code located in this specific service file (notifications_activities.py) to handle the request."

Adding a New Backend Endpoint (Flask)

The presenter explains the concept of "service objects".
He defines a new endpoint for /api/activities/notifications.
A new Python file, notifications_activities.py, is created to handle the logic for this new endpoint.
The notifications endpoint is successfully tested.

Updating the Frontend (React)

The presenter identifies that the "Notifications" link on the frontend leads to a 404 error.
A new page component, NotificationFeedPage.jsx, is created.
The NotificationFeedPage is modified to fetch data from the new /api/activities/notifications endpoint.
The "Notifications" tab now successfully displays the data from the backend.

This code is a classic example of client-side routing in a React application using the React Router v6 library.

1. Imports
```JavaScript

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
```
import './App.css';: This line imports a CSS file. It's for styling the components within this file or the overall application. It doesn't affect the logic, just the appearance.

import ... from './pages/...';: These lines are importing various React components. Each of these imports is bringing in a Page component that represents a full page or screen in your application (e.g., the Home Feed, the Sign-in page, etc.). They are separate files, likely in a ./pages directory.

import React from 'react';: This is the standard import for the React library itself, which is needed to use JSX (the HTML-like syntax) and React features.

import { createBrowserRouter, RouterProvider } from "react-router-dom";: This is the most crucial part for the routing logic.

createBrowserRouter: This is a function from React Router that's used to create a browser router instance. It's the recommended way to handle routing for web applications.

RouterProvider: This is a component that you wrap your application in. It provides the routing context to all the components inside it, making the router available to the entire app.

2. Creating the Router
```JavaScript

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
  // ... and so on for all the other routes
]);
```
const router = createBrowserRouter([...]);: This is where the magic happens. You are creating a router configuration object.

createBrowserRouter(...): This function takes an array of route objects as its argument.

{ path: "/...", element: <... /> }: Each object in the array defines a single route.

path: This is the URL path in the browser's address bar. For example, when the user visits http://your-app.com/notifications, React Router will match this path.

element: This is the React component that should be rendered when the path matches the current URL.

Example: { path: "/", element: <HomeFeedPage /> }: When the user is at the root URL of your website (/), the <HomeFeedPage /> component will be displayed.

Example with a dynamic parameter: { path: "/@:handle", element: <UserFeedPage /> }: The :@handle part is a dynamic segment. This means the part of the URL after the @ can be anything (e.g., / @johndoe, / @janedoe). React Router will capture that value and make it available to the UserFeedPage component, which can then use it to fetch data for that specific user.

This entire block of code is building the mapping from URL paths to React components. It's defining what UI to show for each "page" of your single-page application.

3. The App Component
```JavaScript

function App() {
  return (
    <>
      <RouterProvider router={router} />
    </>
  );
}
```
function App() { ... }: This defines the main App React component. In a Create React App or similar setup, this is the top-level component that gets rendered into the HTML file (index.html).

return (...): This is the JSX that the component renders.

<> ... </>: This is a React Fragment, which is a way to group multiple elements without adding an extra node to the DOM. In this case, it's just wrapping a single component.

<RouterProvider router={router} />: This is the most important part of the component's render logic.

It renders the RouterProvider component.

It passes the router configuration object (the one we created just above) to it as a prop.

By doing this, the RouterProvider takes control of the browser's URL and history. It listens for changes to the URL and renders the correct component (element) based on the path you defined in your router configuration.

4. Export
```JavaScript

export default App;
```
export default App;: This line makes the App component available to other files. The index.js file (or a similar entry file) will import this App component and mount it to the DOM, which starts the entire React application.

Summary
In a nutshell, this App.js file is not for defining API routes. Its purpose is to set up the client-side routing for your React application. It uses React Router to:

Map specific URL paths (like /notifications or /signup).

To the corresponding React component that should be displayed (like <NotificationsFeedPage /> or <SignupPage />).

Manage the browser's URL and history so that the user can navigate between these "pages" without a full page reload, giving the app a fast, fluid user experience.


To install the postgres client into Gitpod
```sh
- name: postgres
  init:
    curl -fsSl https://www.postgresql.org/media/keys/ACCC4CF8.asc|sudo gpg --dearmor -o /ect/apt/trusted.gpg.d/postgresql.gpg
    echo "deb http://apt.postgresql.org/pub/repos/apt/ `lsb_release -cs`-pgdg main" |sudo tee /etc/apt/sources.list.d/pgdg.list
    sudo apt update
    sudo apt install -y postgresql-client-13 libpq-dev
```
### If I am in gitpod and I download postgres into my envirnment using my docker compose file, why do I need to download the postegres client in addition to communicate with postgres?

###Answer:
You need to install the PostgreSQL client separately in your Gitpod environment because of how Docker containers work, even when using Docker Compose.

Here's why:

Container Isolation: Your Docker Compose file spins up a PostgreSQL server within its own isolated container. This container has everything the PostgreSQL server needs to run, but it doesn't automatically expose command-line tools like psql or other client applications directly to your Gitpod workspace's main terminal or file system.

Client-Server Model: To interact with the PostgreSQL server running inside its Docker container, your Gitpod workspace (which is essentially another environment, albeit also containerized by Gitpod) needs its own client software. This client acts as a bridge, sending commands to the PostgreSQL server and receiving results back.

Separate Purposes:

The Docker container (PostgreSQL server) is focused on running the database engine itself.

The PostgreSQL client (like psql or your GUI "Database Client") is focused on providing you with tools to connect to and manage that database server from your local development environment.

So, even though the server is running, you still need the client tools in your Gitpod workspace to talk to it. Think of it like having a web server running on a remote machine; you still need a web browser on your local machine to access it.



