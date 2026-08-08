/* eslint-disable @typescript-eslint/no-require-imports */
const os = require("node:os");

const originalUserInfo = os.userInfo;
os.userInfo = function safeUserInfo(options) {
  try {
    return originalUserInfo(options);
  } catch {
    return {
      uid: -1,
      gid: -1,
      username: process.env.USERNAME || process.env.USER || "ellejew",
      homedir: process.env.USERPROFILE || process.cwd(),
      shell: null,
    };
  }
};
