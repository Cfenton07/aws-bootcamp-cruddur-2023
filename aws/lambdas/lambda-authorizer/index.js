"use strict";

const { CognitoJwtVerifier } = require("aws-jwt-verify");

const jwtVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID,
  tokenUse: "access",
  clientId: process.env.CLIENT_ID,
});

exports.handler = async (event) => {
  // Audit HIGH-02: the full event includes the Authorization header.
  console.log("request:", event.routeKey);

  const jwt = event.headers.authorization;
  try {
    const payload = await jwtVerifier.verify(jwt);
    console.log("Access allowed for sub:", payload.sub);
  } catch (err) {
    console.error("Access denied:", err.name, err.message);
    return { isAuthorized: false };
  }

  return { isAuthorized: true };
};