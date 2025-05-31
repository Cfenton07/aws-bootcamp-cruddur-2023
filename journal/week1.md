# Week 1 — App Containerization

> Gitpod make sure to install the docker extension
## Containerized Backend
### Run Python

```sh
cd backend-flask
export FRONTEND_URL="*"
export BACKEND_URL="*"
python3 -m flask run --host=0.0.0.0 --port=4567
cd ..
```

### Script for docker container
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
