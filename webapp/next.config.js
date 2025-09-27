const path = require("path");

/** @type {import('next').NextConfig} */
module.exports = {
  // Let Next know the monorepo root so file tracing is correct
  outputFileTracingRoot: path.join(__dirname, ".."),
};
