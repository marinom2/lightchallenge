// Exclude test-only scaffolding from coverage stats.
// Anything under contracts/mocks/ is for testing (helpers, stubs, proxies).
module.exports = {
    skipFiles: [
      "mocks/",          // contracts/mocks/*
    ],
  };