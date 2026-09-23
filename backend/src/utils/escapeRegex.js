// src/utils/escapeRegex.js
// Responsibility: Escape special regex characters in user-provided
// search input before it's used to build a MongoDB $regex query.
// Without this, characters like "*", "(", "." etc. in a search term
// could throw or behave unexpectedly (a basic regex-injection guard).

const escapeRegex = (string = "") => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export default escapeRegex;
