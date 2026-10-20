FROM node@sha256:7cc56ef285a8568121537d17b05e72128f01b89c54607b51acf084a50ef483f3
WORKDIR /gateway
COPY ops/dr-nib-canary/verifier/server.mjs ./server.mjs
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
