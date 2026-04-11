FROM node:22-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m chessrunner
USER chessrunner
WORKDIR /home/chessrunner

CMD ["node", "--version"]
