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

# Install Chromium and dependencies
RUN apt-get update && apt-get install -y chromium-browser

# Copy package.json and package-lock.json to the working directory
COPY package*.json .

# Install app dependencies
RUN npm install

# Copy the rest of the app source code to the working directory
COPY . .   

# Expose the port that your Express app listens on
EXPOSE 3000
RUN npm install pm2 -g
# Specify the command to run your Express app
CMD [ "node",  "index.js" ]



#  # Use the official Node.js 16 image as a parent image
# FROM node:16

# # Set the working directory inside the container
# WORKDIR /usr/src/app

# # Update the package list and install chromium and necessary fonts
# RUN apt-get update \
#  && apt-get install -y chromium \
#     fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
#     --no-install-recommends

# # To user admin acess to the container
# RUN chown node:node /usr/src/app


# # Switch to 'node' user for security reasons
# USER node

# # Set environment variables for Puppeteer
# ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
# ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/chromium

# # Copy package.json and package-lock.json (if available) to the working directory
# COPY --chown=node package*.json ./

# # Install app dependencies
# RUN npm install

# # Copy the rest of the application's source code to the working directory
# COPY --chown=node . .

# # Expose port 3000 to the outside once the container has launched
# EXPOSE 3000

# # Define the command to run your app (this will start your Express server)
# CMD ["node", "index.js"]
