# Base image
FROM node

# Environment variables
ENV IP_ADDRESS=localhost
ENV PORT=3000
ENV ELASTICSEARCH_HOSTS=http://localhost:9200
ENV PATH_TO_DATA=/app/data
ENV MEETINGS_INDEX_NAME=meetings-index
ENV WORDS_INDEX_NAME=words-index
ENV SENTENCES_INDEX_NAME=sentences-index

# Create app directory
WORKDIR /app

# Copy application dependency definitions
COPY package*.json ./

# Install app dependencies
RUN npm install

# Bundle app source code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Run the API
CMD [ "npm", "start" ]
