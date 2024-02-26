import "./worker-pool";

process.on("uncaughtException", (error) => {
  console.error("UncaughtException", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("UnhandledRejection", promise, reason);
});
