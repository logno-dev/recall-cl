# Use the official Bun image as the base image
FROM oven/bun:latest as builder

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and bun.lockb to the working directory
COPY package.json bun.lockb ./

# Install dependencies
RUN bun install

# Copy the rest of the application code
COPY . .

# Build the application
RUN bun run build

# Use a minimal image for the final stage
FROM oven/bun:slim

# Set the working directory inside the container
WORKDIR /app

# Copy the built application from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lockb ./

# Install dependencies
RUN bun install --production

# Expose the port the application listens on
EXPOSE 3000

# Set the command to run the application
CMD ["bun", "run", "start"]
