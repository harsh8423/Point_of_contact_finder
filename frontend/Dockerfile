FROM node:20-alpine

WORKDIR /app

# Install dependencies first for better caching
COPY package.json package-lock.json ./
RUN npm install

# Copy all source files
COPY . .

# Pass in the API URL so the build bakes it into the client-side code
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Build the Next.js app
RUN npm run build

EXPOSE 3000

# Run the Next.js production server
CMD ["npm", "start"]
