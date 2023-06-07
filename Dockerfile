# Use the playwright base image
FROM mcr.microsoft.com/playwright:bionic

# Set the working directory inside the container
WORKDIR /app

# Install nvm
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash

# Load nvm
RUN /bin/bash -c "source ~/.nvm/nvm.sh && nvm install 16.18.1"

# Set the installed Node.js version as the default
RUN /bin/bash -c "source ~/.nvm/nvm.sh && nvm alias default 16.18.1"

# Activate nvm
SHELL ["/bin/bash", "--login", "-c"]

# Copy package.json and package-lock.json to the working directory
COPY package*.json .

# Install app dependencies
RUN npm install

# Copy the rest of the app source code to the working directory
COPY . .

# Expose the port that your Express app listens on
EXPOSE 3000

# Specify the command to run your Express app
CMD node index.js
