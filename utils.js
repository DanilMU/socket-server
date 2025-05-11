const trimStr = (str) => {
  if (typeof str !== "string") return "";
  return str.trim().toLowerCase();
};

module.exports = { trimStr };
