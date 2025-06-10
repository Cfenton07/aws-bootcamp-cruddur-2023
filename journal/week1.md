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
- make sure to unlock the port on the port tab next to the terminal
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
### Build Container (This will download & build my container image)
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




