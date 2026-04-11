# Use a lightweight Linux base
FROM ubuntu:22.04

# Avoid prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Download and install cutechess-cli
RUN curl -L https://github.com/cutechess/cutechess/releases/download/v1.3.1/cutechess-cli-1.3.1-linux64.tar.gz | tar xz \
    && mv cutechess-cli/cutechess-cli /usr/local/bin/ \
    && rm -rf cutechess-cli

# Create a non-root user for execution
RUN useradd -m chessrunner
USER chessrunner
WORKDIR /home/chessrunner

# Default command
CMD ["cutechess-cli", "--help"]
