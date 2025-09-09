# Use Node.js LTS
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies first
COPY package*.json ./
RUN npm install --production

# Copy the rest of the source code
COPY . .

# Expose port (Railway will set PORT env automatically)
EXPOSE 3000

# Start the app
CMD ["npm", "start"]
